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
// `__reportMeta` shares meta + startTime so primary and secondaries get the
// same timestamp in their reportFileName. `playwright` re-declares the
// upstream options fixture so the bridge override below typechecks.
interface InternalFixtures extends MidsceneFixtures {
  __reportMeta: { meta: ReportMeta; startTime: number; filepath: string };
  playwright: PlaywrightOptions;
}

let _defaults: MidsceneOptions = {};

/**
 * Set repo-wide `midsceneOptions` defaults that every test file picks up via
 * the `midsceneOptions` fixture.
 *
 * **Must be called from a file referenced in rstest's `setupFiles` config**,
 * which rstest loads as part of every test file's startup chain. Calling this
 * inside a single test file only affects that file.
 *
 * Multiple calls shallow-merge: later calls overwrite previously-set top-level
 * keys but keep untouched ones. Per-file overrides go via
 * `test.extend({ midsceneOptions: { ... } })`.
 */
export const defineMidsceneDefaults = (next: MidsceneOptions): void => {
  _defaults = { ..._defaults, ...next };
};

// This module deliberately registers no module-level hooks and keeps no
// per-file state. Under `isolate: false` the module graph is shared across
// test files, so anything registered here would bind to whichever file
// happened to load it first. Everything per-file is derived from
// `task.filepath` instead, and report merging happens in `MidsceneReporter`.
// Browser lifecycle is managed by `@rstest/playwright` (shared per worker,
// closed when idle).
export const test = playwrightBaseTest.extend<InternalFixtures>({
  midsceneOptions: async (_ctx, use) => {
    await use(_defaults);
  },

  url: '',

  __reportMeta: async ({ task }, use) => {
    const filepath = task.filepath;
    if (!filepath) {
      throw new Error(
        '@midscene/rstest could not determine the current test file: `task.filepath` is missing from the rstest test context. This requires @rstest/core >= 0.11.2.',
      );
    }
    await use({
      meta: buildReportMeta({ task }, filepath),
      startTime: performance.now(),
      filepath,
    });
  },

  // Bridge `midsceneOptions` onto `@rstest/playwright`'s `playwright` options
  // fixture. Browser/context lifecycle (including debug mode and trace
  // capture) is fully managed upstream from these options.
  playwright: async ({ midsceneOptions }, use) => {
    const launchOptions = await applyResolver<LaunchOptions>(
      midsceneOptions.launchOptions,
      {
        headless: midsceneOptions.headless ?? isCI,
        args: DEFAULT_BROWSER_ARGS,
      },
    );
    const contextOptions = await applyResolver<BrowserContextOptions>(
      midsceneOptions.contextOptions,
      {
        viewport: midsceneOptions.viewport ?? DEFAULT_VIEWPORT,
      },
    );
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
    await collectReport(
      agent,
      __reportMeta.startTime,
      { task },
      __reportMeta.filepath,
    );
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
        await collectReport(
          secondary,
          __reportMeta.startTime,
          { task },
          __reportMeta.filepath,
        );
      } catch (err) {
        debug('secondary agent report failed:', err);
      }
    }
    void agent;
  },
}) as unknown as PlaywrightTest<PlaywrightFixture & MidsceneFixtures>;
