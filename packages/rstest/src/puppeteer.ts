import type { Cache } from '@midscene/core';
import { processCacheConfig } from '@midscene/core/utils';
import { getDebug } from '@midscene/shared/logger';
import {
  PuppeteerAgent,
  type WebPageAgentOpt,
  overrideAIConfig,
} from '@midscene/web/puppeteer';
import { afterAll, test as baseTest, beforeAll } from '@rstest/core';
import puppeteer, {
  type Browser,
  type GoToOptions,
  type LaunchOptions,
  type Page,
} from 'puppeteer';
import { isCI } from 'std-env';
import {
  DEFAULT_BROWSER_ARGS,
  DEFAULT_VIEWPORT,
  createDefaultsStore,
} from './provider-shared';
import {
  ReportHelper,
  type ReportMeta,
  buildReportMeta,
} from './report-helper';
import { type Resolver, applyResolver } from './resolve';
import type { TestApi } from './test-api-types';

/**
 * Cache configuration shape exposed to rstest users. `id` is optional — when
 * omitted (or when `cache: true`), the package fills in a stable id derived
 * from the test's file basename and name, so re-runs of the same test reuse
 * the same cache namespace without the user having to manage id strings.
 */
export type RstestCache =
  | false
  | true
  | { strategy?: 'read-only' | 'read-write' | 'write-only'; id?: string };

type AgentOptions = Omit<
  WebPageAgentOpt,
  'groupName' | 'reportFileName' | 'cache'
> & {
  cache?: RstestCache;
};

export type { Resolver };
export { overrideAIConfig };
export type { WebPageAgentOpt };

const debug = getDebug('rstest:puppeteer', { console: true });

export interface MidsceneOptions {
  /** Default: `true` in CI, `false` locally. */
  headless?: boolean;
  /**
   * Default: 1920×1080. Routed into the default `launchOptions.defaultViewport`.
   * Nested fields in `launchOptions.defaultViewport` override this — e.g.
   * passing `viewport: { width: 1440, height: 900 }` together with
   * `launchOptions: { defaultViewport: { width: 1920 } }` yields a final
   * default viewport of `{ width: 1920, height: 900 }`.
   */
  viewport?: { width: number; height: number };
  launchOptions?: Resolver<LaunchOptions>;
  gotoOptions?: GoToOptions;
  agentOptions?: AgentOptions;
}

export type AgentForPage = (
  page: Page,
  opts?: AgentOptions,
) => Promise<PuppeteerAgent>;

export interface MidsceneFixtures {
  midsceneOptions: MidsceneOptions;
  /**
   * Target URL the default `page` fixture navigates to. Empty string disables
   * auto-navigation.
   */
  url: string;
  /**
   * File-scoped Puppeteer `Browser`. Launched lazily — if no test in the file
   * destructures anything that depends on `browser`, no browser is started.
   */
  browser: Browser;
  page: Page;
  agent: PuppeteerAgent;
  /**
   * Factory for secondary agents bound to popups / extra pages. Reports are
   * merged alongside the primary's. Destroy is automatic in fixture teardown.
   */
  agentForPage: AgentForPage;
}

// Private fixture (see playwright.ts).
interface InternalFixtures extends MidsceneFixtures {
  __reportMeta: { meta: ReportMeta; startTime: number };
}

const defaultsStore = createDefaultsStore<MidsceneOptions>();

/**
 * Set repo-wide `midsceneOptions` defaults that every test file picks up via
 * the `midsceneOptions` fixture.
 *
 * **Must be called from a file referenced in rstest's `setupFiles` config** —
 * each test file runs in its own isolated module graph, so the store is
 * populated per file at setup time. Calling this inside a single test file
 * only affects that file.
 *
 * Multiple calls shallow-merge: later calls overwrite previously-set top-level
 * keys but keep untouched ones. Per-file overrides go via
 * `test.extend({ midsceneOptions: { ... } })`.
 */
export const defineMidsceneDefaults = defaultsStore.define;

let _filepath = '';
let _browserPromise: Promise<Browser> | null = null;
const _reportHelper = new ReportHelper();

beforeAll(async (suite: { filepath: string }) => {
  if (_filepath && _filepath !== suite.filepath) {
    throw new Error(
      `@midscene/rstest requires test isolation but detected module-graph reuse across files (${_filepath} -> ${suite.filepath}). Remove \`isolate: false\` from your rstest config.`,
    );
  }
  _filepath = suite.filepath;
});

afterAll(async () => {
  _reportHelper.mergeReports(_filepath);
  if (_browserPromise) {
    try {
      await (await _browserPromise).close();
    } catch (err) {
      debug('browser close failed:', err);
    }
    _browserPromise = null;
  }
});

function acquireBrowser(opts: MidsceneOptions): Promise<Browser> {
  if (!_browserPromise) {
    _browserPromise = applyResolver(opts.launchOptions, {
      headless: opts.headless ?? isCI,
      args: DEFAULT_BROWSER_ARGS,
      defaultViewport: opts.viewport ?? DEFAULT_VIEWPORT,
    }).then((launchOptions) => puppeteer.launch(launchOptions));
  }
  return _browserPromise;
}

export const test = baseTest.extend<InternalFixtures>({
  midsceneOptions: async (_ctx, use) => {
    await use(defaultsStore.get());
  },

  url: '',

  __reportMeta: async ({ task }, use) => {
    await use({
      meta: buildReportMeta({ task }, _filepath),
      startTime: performance.now(),
    });
  },

  browser: async ({ midsceneOptions }, use) => {
    await use(await acquireBrowser(midsceneOptions));
  },

  page: async ({ browser, url, midsceneOptions }, use) => {
    const page = await browser.newPage();
    if (url) {
      await page.goto(url, midsceneOptions.gotoOptions);
    }
    await use(page);
    try {
      await page.close();
    } catch (err) {
      debug('page close failed:', err);
    }
  },

  agent: async ({ page, midsceneOptions, __reportMeta, task }, use) => {
    const { cache: rawCache, ...rest } = midsceneOptions.agentOptions ?? {};
    const cache = processCacheConfig(
      rawCache as Cache | undefined,
      __reportMeta.meta.cacheId,
    );
    const agent = new PuppeteerAgent(page, {
      ...rest,
      cache,
      groupName: __reportMeta.meta.groupName,
      reportFileName: __reportMeta.meta.reportFileName,
    });
    await use(agent);
    await _reportHelper.collectReport(agent, __reportMeta.startTime, { task });
  },

  // Depends on `agent` so its teardown runs BEFORE the primary's.
  agentForPage: async ({ agent, midsceneOptions, __reportMeta, task }, use) => {
    const secondaries: PuppeteerAgent[] = [];
    let counter = 0;

    const helper: AgentForPage = async (secondaryPage, opts) => {
      counter += 1;
      const { cache: optsCache, ...optsRest } = opts ?? {};
      const { cache: fixtureCache, ...fixtureRest } =
        midsceneOptions.agentOptions ?? {};
      const cache = processCacheConfig(
        (optsCache ?? fixtureCache) as Cache | undefined,
        __reportMeta.meta.cacheId,
      );
      const secondary = new PuppeteerAgent(secondaryPage, {
        ...fixtureRest,
        ...optsRest,
        cache,
        groupName: __reportMeta.meta.groupName,
        reportFileName: `${__reportMeta.meta.reportFileName}-page${counter}`,
      });
      secondaries.push(secondary);
      return secondary;
    };
    await use(helper);

    for (const secondary of secondaries) {
      try {
        await _reportHelper.collectReport(secondary, __reportMeta.startTime, {
          task,
        });
      } catch (err) {
        debug('secondary agent report failed:', err);
      }
    }
    void agent;
  },
}) as unknown as TestApi<MidsceneFixtures>;
