import {
  PlaywrightAgent,
  type WebPageAgentOpt,
  overrideAIConfig,
} from '@midscene/web/playwright';
import {
  type Browser,
  type BrowserContextOptions,
  type LaunchOptions,
  type Page,
  chromium,
} from 'playwright';
import * as playwrightNs from 'playwright';
import { isCI } from 'std-env';
import { registerLifecycle } from './lifecycle';
import {
  DEFAULT_BROWSER_ARGS,
  DEFAULT_VIEWPORT,
  createDefaultsStore,
} from './provider-shared';
import type { RstestTestContext } from './report-helper';
import { type Resolver, applyResolver } from './resolve';

export type { Resolver };
export { overrideAIConfig };
export type { WebPageAgentOpt };

type GoToOptions = NonNullable<Parameters<Page['goto']>[1]>;

export interface SetupApi {
  url: string;
  browser: Browser;
  playwright: typeof playwrightNs;
}

export interface CreateWebTestOptions {
  /** Default: `true` in CI, `false` locally. */
  headless?: boolean;
  /** Default: 1920×1080. Routed into the default `contextOptions.viewport`. */
  viewport?: { width: number; height: number };

  launchOptions?: Resolver<LaunchOptions>;
  contextOptions?: Resolver<BrowserContextOptions>;
  gotoOptions?: GoToOptions;

  agentOptions?: Omit<WebPageAgentOpt, 'groupName' | 'reportFileName'>;

  /**
   * Take over the per-test page lifecycle. Return the page midscene should
   * drive, plus an optional `teardown` that runs while the page is still
   * alive (before `agent.destroy()`). When provided, midscene skips its
   * default page setup; `headless`, `viewport`, `launchOptions`,
   * `contextOptions`, and `gotoOptions` are all ignored. Only `agentOptions`
   * still applies.
   */
  setup?: (api: SetupApi) => Promise<{
    page: Page;
    teardown?: (testCtx: RstestTestContext) => Promise<void>;
  }>;
}

export interface WebTestContext {
  readonly agent: PlaywrightAgent;
  /**
   * Raw Playwright `Page` for advanced scenarios — `page.route`,
   * `page.evaluate`, `page.context().cookies()`, etc. Prefer `agent` for AI
   * actions and assertions; reach for `page` only when you need
   * browser-primitive control.
   */
  readonly page: Page;
  /**
   * The file-scoped Playwright `Browser`. Use it to spin up extra contexts or
   * pages mid-test (e.g. a second user session). Valid between `beforeAll`
   * and `afterAll`.
   */
  readonly browser: Browser;
  /**
   * Build a midscene agent for another page (popup, new tab, manually-created
   * page from `browser.newContext()`). The agent's report is merged alongside
   * the primary's. Destroy is automatic in `afterEach`.
   */
  agentForPage(
    page: Page,
    opts?: Omit<WebPageAgentOpt, 'groupName' | 'reportFileName'>,
  ): Promise<PlaywrightAgent>;
}

const defaultsStore = createDefaultsStore<CreateWebTestOptions>();

/**
 * Project-wide defaults for `createWebTest`. Call from a `setupFiles` entry.
 * Per-call options shallow-merge over these at the top-level key; nested
 * fields like `launchOptions` are replaced, not deep-merged. Use the function
 * form of a resolver to compose with defaults.
 */
export const defineMidsceneDefaults = defaultsStore.define;

async function defaultSetup(api: SetupApi, opts: CreateWebTestOptions) {
  const contextOptions = await applyResolver(opts.contextOptions, {
    viewport: opts.viewport ?? DEFAULT_VIEWPORT,
  });
  const context = await api.browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(api.url, opts.gotoOptions);

  return {
    page,
    async teardown() {
      try {
        await context.close();
      } catch {
        // The user's setup teardown may have already closed the context.
      }
    },
  };
}

export function createWebTest(
  url: string,
  options: CreateWebTestOptions = {},
): WebTestContext {
  const merged: CreateWebTestOptions = { ...defaultsStore.get(), ...options };

  const inner = registerLifecycle<
    PlaywrightAgent,
    Page,
    Browser,
    CreateWebTestOptions
  >(url, merged, {
    async launchBrowser(opts) {
      const launchOptions = await applyResolver(opts.launchOptions, {
        headless: opts.headless ?? isCI,
        args: DEFAULT_BROWSER_ARGS,
      });
      return chromium.launch(launchOptions);
    },
    async closeBrowser(browser) {
      await browser.close();
    },
    async createAgent(browser, targetUrl, opts, meta) {
      const setup = opts.setup ?? ((api) => defaultSetup(api, opts));
      const { page, teardown } = await setup({
        url: targetUrl,
        browser,
        playwright: playwrightNs,
      });

      const agent = new PlaywrightAgent(page, {
        ...opts.agentOptions,
        groupName: meta.groupName,
        reportFileName: meta.reportFileName,
      });

      return { agent, page, teardown };
    },
  });

  return {
    get agent() {
      return inner.agent;
    },
    get page() {
      return inner.page;
    },
    get browser() {
      return inner.browser;
    },
    async agentForPage(page, opts) {
      return inner.spawnSecondaryAgent(
        (meta) =>
          new PlaywrightAgent(page, {
            ...merged.agentOptions,
            ...opts,
            groupName: meta.groupName,
            reportFileName: meta.reportFileName,
          }),
      );
    },
  };
}
