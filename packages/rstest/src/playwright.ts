import type { Cache } from '@midscene/core';
import { processCacheConfig } from '@midscene/core/utils';
import { getDebug } from '@midscene/shared/logger';
import {
  PlaywrightAgent,
  type WebPageAgentOpt,
  overrideAIConfig,
} from '@midscene/web/playwright';
import type { TestContext, TestOptions } from '@rstest/core';
import {
  type PlaywrightFixture,
  type PlaywrightFixtures,
  type PlaywrightOptions,
  type PlaywrightTest,
  test as playwrightBaseTest,
} from '@rstest/playwright';
import type { Page } from 'playwright';
import { isCI } from 'std-env';
import {
  type ReportMeta,
  buildReportMeta,
  collectReport,
} from './report-helper';

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

/**
 * Options for constructing agents (the `agent` fixture and `agentForPage`
 * ones). `groupName` and `reportFileName` are managed by the lifecycle;
 * `cache` is reshaped so an id can be auto-derived from the test.
 */
export type AgentOptions = Omit<
  WebPageAgentOpt,
  'groupName' | 'reportFileName' | 'cache'
> & {
  cache?: RstestCache;
};

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

/**
 * The default value this package ships for `@rstest/playwright`'s `playwright`
 * options fixture. Overriding the fixture replaces this object wholesale
 * (standard rstest fixture semantics — there is no implicit merging), so
 * spread it when you want to keep the defaults:
 *
 * ```ts
 * test.extend({
 *   playwright: {
 *     ...defaultPlaywrightOptions,
 *     contextOptions: { locale: 'zh-CN' },
 *   },
 * });
 * ```
 */
export const defaultPlaywrightOptions: PlaywrightOptions = {
  launchOptions: {
    headless: isCI,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  },
  contextOptions: {
    viewport: { width: 1920, height: 1080 },
  },
};

export type AgentForPage = (
  page: Page,
  opts?: AgentOptions,
) => Promise<PlaywrightAgent>;

export interface MidsceneFixtures {
  /**
   * Default options for every agent this test constructs. Defaults to `{}`;
   * set project-wide values by extending this fixture in a shared module and
   * exporting the extended `test`, or per file via
   * `test.extend({ agentOptions: { ... } })`. `agentForPage`'s per-call opts
   * override these.
   */
  agentOptions: AgentOptions;
  /**
   * Midscene `PlaywrightAgent` bound to the upstream `page`. Navigation is
   * the test's own job (`await page.goto(...)`), exactly as in Midscene's
   * Playwright integration and in plain `@rstest/playwright`.
   */
  agent: PlaywrightAgent;
  /**
   * Factory for secondary agents bound to popups / extra contexts. Reports are
   * merged alongside the primary's. Destroy is automatic in fixture teardown.
   */
  agentForPage: AgentForPage;
}

// `__reportMeta` is a private fixture — hidden from the public type via the
// cast at the bottom. It is shared so primary and secondary agents land in the
// same report group and manifest. `playwright` is re-declared only so the
// static default value below typechecks; its public type comes from upstream.
interface InternalFixtures extends MidsceneFixtures {
  __reportMeta: ReportMeta;
  playwright: PlaywrightOptions;
}

/**
 * Fixture keys `test.extend` rejects at compile time. `agent` and
 * `agentForPage` are deliverables, not override points — a replacement cannot
 * consume the base value (rstest overrides never can) and would silently
 * bypass report collection. `__reportMeta` is internal plumbing.
 */
type SealedFixtureKeys = 'agent' | 'agentForPage' | '__reportMeta';

/**
 * The public type of {@link test}: upstream's `PlaywrightTest` with `extend`
 * re-declared to reject {@link SealedFixtureKeys} — the same technique
 * `@rstest/playwright` itself uses to specialize `@rstest/core`'s `extend`.
 * Type-level only; runtime fixture semantics are untouched.
 *
 * `Omit` over a callable type drops its call signatures, so they are
 * re-declared here, mirroring upstream's `PlaywrightTestBase` (function-first
 * overload first, so `test(name, fn)` binds the callback's context types).
 */
export type MidsceneTest<ExtraContext = PlaywrightFixture & MidsceneFixtures> =
  Omit<PlaywrightTest<ExtraContext>, 'extend'> & {
    (
      description: string,
      fn?: (context: TestContext & ExtraContext) => void | Promise<void>,
      timeout?: number,
    ): void;
    (
      description: string,
      options: TestOptions,
      fn?: (context: TestContext & ExtraContext) => void | Promise<void>,
    ): void;
    extend: <
      T extends Record<string, any> & { [K in SealedFixtureKeys]?: never },
    >(
      fixtures: PlaywrightFixtures<T, ExtraContext>,
    ) => MidsceneTest<{
      [K in keyof T | keyof ExtraContext]: K extends keyof T
        ? T[K]
        : K extends keyof ExtraContext
          ? ExtraContext[K]
          : never;
    }>;
  };

/**
 * Single place where agent options are resolved: fixture-level
 * `agentOptions`, then per-call `opts` for secondaries, with the report group
 * and cache namespace pinned to the current test.
 */
function createAgent(
  page: Page,
  agentOptions: AgentOptions,
  meta: ReportMeta,
  reportFileName: string,
  opts?: AgentOptions,
): PlaywrightAgent {
  const { cache: fixtureCache, ...fixtureRest } = agentOptions;
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
//
// Upstream fixtures are passed through untouched: `playwright` only gets a
// different default value (replaced wholesale on user override, upstream
// semantics), and `page` / `browser` / `context` / lifecycle (including
// PWDEBUG pause-on-failure and keep-page-open-on-failure) are entirely
// upstream's.
export const test = playwrightBaseTest.extend<InternalFixtures>({
  // Repo-wide defaults are set the same way as with Playwright Test: extend
  // this fixture in a shared module and export the extended `test` — see the
  // "Project-wide defaults" section of the docs. No side-channel setter.
  agentOptions: {},

  playwright: defaultPlaywrightOptions,

  __reportMeta: async ({ task }, use) => {
    const filepath = task.filepath;
    if (!filepath) {
      throw new Error(
        '@midscene/rstest could not determine the current test file: `task.filepath` is missing from the rstest test context. This requires @rstest/core >= 0.11.2.',
      );
    }
    await use(buildReportMeta(task, filepath));
  },

  agent: async ({ page, agentOptions, __reportMeta, task }, use) => {
    const agent = createAgent(
      page,
      agentOptions,
      __reportMeta,
      __reportMeta.reportFileName,
    );
    await use(agent);
    await collectReport(agent, __reportMeta, task);
  },

  // Depends on `agent` so its teardown runs BEFORE the primary's — secondaries
  // are collected while their pages are still alive.
  agentForPage: async ({ agent, agentOptions, __reportMeta, task }, use) => {
    const secondaries: PlaywrightAgent[] = [];

    const helper: AgentForPage = async (secondaryPage, opts) => {
      const secondary = createAgent(
        secondaryPage,
        agentOptions,
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
}) as unknown as MidsceneTest;
