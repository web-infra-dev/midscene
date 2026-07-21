import type { Cache } from '@midscene/core';
import { processCacheConfig } from '@midscene/core/utils';
import { getDebug } from '@midscene/shared/logger';
import {
  PlaywrightAgent,
  type WebPageAgentOpt,
  overrideAIConfig,
} from '@midscene/web/playwright';
import {
  type PlaywrightFixture,
  type PlaywrightOptions,
  type PlaywrightTest,
  test as playwrightBaseTest,
} from '@rstest/playwright';
import type { BrowserContextOptions, LaunchOptions, Page } from 'playwright';
import { isCI } from 'std-env';
import {
  type ReportMeta,
  buildReportMeta,
  collectReport,
} from './report-helper';
import { type Resolver, applyResolver } from './resolve';

type GoToOptions = NonNullable<Parameters<Page['goto']>[1]>;

const DEFAULT_BROWSER_ARGS = ['--no-sandbox', '--ignore-certificate-errors'];

const DEFAULT_VIEWPORT = { width: 1920, height: 1080 } as const;

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

// Re-export the upstream surface so users can import everything (Playwright
// flavored `expect`, hooks, fixture/option types) from this one entry.
export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
} from '@rstest/playwright';
export type {
  PlaywrightDebugOptions,
  PlaywrightFixture,
  PlaywrightOptions,
  PlaywrightServe,
  PlaywrightServeOptions,
  PlaywrightServeResult,
  PlaywrightTest,
  PlaywrightTraceMode,
  PlaywrightTraceOptions,
} from '@rstest/playwright';

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
  /**
   * Passed through to `@rstest/playwright`'s debug support: headed browser,
   * slowMo, DevTools, pause-on-failure. Also enabled via the `PWDEBUG` env.
   */
  debug?: PlaywrightOptions['debug'];
  /**
   * Passed through to `@rstest/playwright`'s trace support: saves a Playwright
   * trace (`trace.zip` + AI-readable summary). Also enabled via the
   * `RSTEST_PLAYWRIGHT_TRACE` env.
   */
  trace?: PlaywrightOptions['trace'];
}

export type AgentForPage = (
  page: Page,
  opts?: AgentOptions,
) => Promise<PlaywrightAgent>;

export interface MidsceneFixtures {
  /**
   * Every Midscene knob. Defaults to `{}`; set project-wide values by
   * extending this fixture in a shared module and exporting the extended
   * `test` (the same pattern as Playwright Test), or per file via
   * `test.extend({ midsceneOptions: { ... } })`.
   */
  midsceneOptions: MidsceneOptions;
  /**
   * Target URL the default `page` fixture navigates to. Empty string disables
   * auto-navigation (page stays on `about:blank`).
   */
  url: string;
  /**
   * Per-test page created from `@rstest/playwright`'s `context` fixture, with
   * `url` auto-navigation on top. `browser` / `context` / `request` / `serve`
   * come straight from `@rstest/playwright`.
   */
  page: Page;
  agent: PlaywrightAgent;
  /**
   * Factory for secondary agents bound to popups / extra contexts. Reports are
   * merged alongside the primary's. Destroy is automatic in fixture teardown.
   */
  agentForPage: AgentForPage;
}

// Private fixtures — hidden from the public type via the cast at the bottom.
// `__reportMeta` is shared so primary and secondary agents land in the same
// report group and manifest. `playwright` re-declares the upstream options
// fixture so the bridge override below typechecks.
interface InternalFixtures extends MidsceneFixtures {
  __reportMeta: ReportMeta;
  playwright: PlaywrightOptions;
}

/**
 * Single place where agent options are resolved: fixture-level
 * `agentOptions`, then per-call `opts` for secondaries, with the report group
 * and cache namespace pinned to the current test.
 */
function createAgent(
  page: Page,
  midsceneOptions: MidsceneOptions,
  meta: ReportMeta,
  reportFileName: string,
  opts?: AgentOptions,
): PlaywrightAgent {
  const { cache: fixtureCache, ...fixtureRest } =
    midsceneOptions.agentOptions ?? {};
  const { cache: optsCache, ...optsRest } = opts ?? {};
  return new PlaywrightAgent(page, {
    ...fixtureRest,
    ...optsRest,
    cache: processCacheConfig(
      (optsCache ?? fixtureCache) as Cache | undefined,
      meta.cacheId,
    ),
    groupName: meta.groupName,
    reportFileName,
  });
}

// This module deliberately registers no module-level hooks and keeps no
// per-file state. Under `isolate: false` the module graph is shared across
// test files, so anything registered here would bind to whichever file
// happened to load it first. Everything per-file is derived from
// `task.filepath` instead, and report merging happens in `MidsceneReporter`.
// Browser lifecycle is managed by `@rstest/playwright` (shared per worker,
// closed when idle).
export const test = playwrightBaseTest.extend<InternalFixtures>({
  // Repo-wide defaults are set the same way as with Playwright Test: extend
  // this fixture in a shared module and export the extended `test` — see the
  // "Project-wide defaults" section of the docs. No side-channel setter.
  midsceneOptions: {},

  url: '',

  __reportMeta: async ({ task }, use) => {
    const filepath = task.filepath;
    if (!filepath) {
      throw new Error(
        '@midscene/rstest could not determine the current test file: `task.filepath` is missing from the rstest test context. This requires @rstest/core >= 0.11.2.',
      );
    }
    await use(buildReportMeta(task, filepath));
  },

  // Bridge `midsceneOptions` onto `@rstest/playwright`'s `playwright` options
  // fixture. Browser/context lifecycle (including debug mode and trace
  // capture) is fully managed upstream from these options.
  playwright: async ({ midsceneOptions }, use) => {
    const [launchOptions, contextOptions] = await Promise.all([
      applyResolver<LaunchOptions>(midsceneOptions.launchOptions, {
        headless: midsceneOptions.headless ?? isCI,
        args: DEFAULT_BROWSER_ARGS,
      }),
      applyResolver<BrowserContextOptions>(midsceneOptions.contextOptions, {
        viewport: midsceneOptions.viewport ?? DEFAULT_VIEWPORT,
      }),
    ]);
    await use({
      launchOptions,
      contextOptions,
      debug: midsceneOptions.debug,
      trace: midsceneOptions.trace,
    });
  },

  // Override upstream `page` to add `url` auto-navigation. rstest fixture
  // overrides cannot consume the overridden base value (it would be flagged
  // as a circular dependency), so the page is re-created from the upstream
  // `context` fixture instead of wrapping the upstream `page`.
  page: async ({ context, url, midsceneOptions }, use) => {
    const page = await context.newPage();
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
    const agent = createAgent(
      page,
      midsceneOptions,
      __reportMeta,
      __reportMeta.reportFileName,
    );
    await use(agent);
    await collectReport(agent, __reportMeta, task);
  },

  // Depends on `agent` so its teardown runs BEFORE the primary's — secondaries
  // are collected while their pages are still alive.
  agentForPage: async ({ agent, midsceneOptions, __reportMeta, task }, use) => {
    const secondaries: PlaywrightAgent[] = [];

    const helper: AgentForPage = async (secondaryPage, opts) => {
      const secondary = createAgent(
        secondaryPage,
        midsceneOptions,
        __reportMeta,
        `${__reportMeta.reportFileName}-page${secondaries.length + 1}`,
        opts,
      );
      secondaries.push(secondary);
      return secondary;
    };
    await use(helper);

    for (const secondary of secondaries) {
      try {
        await collectReport(secondary, __reportMeta, task);
      } catch (err) {
        debug('secondary agent report failed:', err);
      }
    }
  },
}) as unknown as PlaywrightTest<PlaywrightFixture & MidsceneFixtures>;
