import type { Cache } from '@midscene/core';
import { processCacheConfig } from '@midscene/core/utils';
import { getDebug } from '@midscene/shared/logger';
import {
  PlaywrightAgent,
  type WebPageAgentOpt,
  overrideAIConfig,
} from '@midscene/web/playwright';
import { afterAll, test as baseTest, beforeAll } from '@rstest/core';
import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type LaunchOptions,
  type Page,
  chromium,
} from 'playwright';
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

type GoToOptions = NonNullable<Parameters<Page['goto']>[1]>;

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

const debug = getDebug('rstest:playwright', { console: true });

export interface MidsceneOptions {
  /** Default: `true` in CI, `false` locally. */
  headless?: boolean;
  /**
   * Default: 1920×1080. Routed into the default `contextOptions.viewport`.
   * Nested fields in `contextOptions.viewport` override this — e.g. passing
   * `viewport: { width: 1440, height: 900 }` together with
   * `contextOptions: { viewport: { width: 1920 } }` yields a final viewport of
   * `{ width: 1920, height: 900 }`.
   */
  viewport?: { width: number; height: number };
  launchOptions?: Resolver<LaunchOptions>;
  contextOptions?: Resolver<BrowserContextOptions>;
  gotoOptions?: GoToOptions;
  agentOptions?: AgentOptions;
}

export type AgentForPage = (
  page: Page,
  opts?: AgentOptions,
) => Promise<PlaywrightAgent>;

export interface MidsceneFixtures {
  midsceneOptions: MidsceneOptions;
  /**
   * Target URL the default `page` fixture navigates to. Empty string disables
   * auto-navigation (page stays on `about:blank`).
   */
  url: string;
  /**
   * File-scoped Playwright `Browser`. Launched lazily — if no test in the file
   * destructures anything that depends on `browser`, no browser is started.
   */
  browser: Browser;
  context: BrowserContext;
  page: Page;
  agent: PlaywrightAgent;
  /**
   * Factory for secondary agents bound to popups / extra contexts. Reports are
   * merged alongside the primary's. Destroy is automatic in fixture teardown.
   */
  agentForPage: AgentForPage;
}

// Private fixture — shared meta + startTime so primary and secondaries get
// the same timestamp in their reportFileName. Hidden from the public type via
// the cast at the bottom.
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

// rstest's default `isolate: true` gives each test file a fresh module graph,
// so these vars start clean per file.
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
    }).then((launchOptions) => chromium.launch(launchOptions));
  }
  return _browserPromise;
}

// rstest 0.9.9 doesn't export the type of `extend`'s return value; cast via the
// hand-rolled `TestApi` (see `test-api-types.ts`).
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

  context: async ({ browser, midsceneOptions }, use) => {
    const contextOptions = await applyResolver(midsceneOptions.contextOptions, {
      viewport: midsceneOptions.viewport ?? DEFAULT_VIEWPORT,
    });
    const context = await browser.newContext(contextOptions);
    await use(context);
    try {
      await context.close();
    } catch (err) {
      debug('context close failed:', err);
    }
  },

  page: async ({ context, url, midsceneOptions }, use) => {
    const page = await context.newPage();
    if (url) {
      await page.goto(url, midsceneOptions.gotoOptions);
    }
    await use(page);
  },

  agent: async ({ page, midsceneOptions, __reportMeta, task }, use) => {
    const { cache: rawCache, ...rest } = midsceneOptions.agentOptions ?? {};
    const cache = processCacheConfig(
      rawCache as Cache | undefined,
      __reportMeta.meta.cacheId,
    );
    const agent = new PlaywrightAgent(page, {
      ...rest,
      cache,
      groupName: __reportMeta.meta.groupName,
      reportFileName: __reportMeta.meta.reportFileName,
    });
    await use(agent);
    await _reportHelper.collectReport(agent, __reportMeta.startTime, { task });
  },

  // Depends on `agent` so its teardown runs BEFORE the primary's — secondaries
  // are collected while their pages are still alive.
  agentForPage: async ({ agent, midsceneOptions, __reportMeta, task }, use) => {
    const secondaries: PlaywrightAgent[] = [];
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
      const secondary = new PlaywrightAgent(secondaryPage, {
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
