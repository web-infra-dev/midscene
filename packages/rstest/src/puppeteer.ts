import {
  PuppeteerAgent,
  type WebPageAgentOpt,
  overrideAIConfig,
} from '@midscene/web/puppeteer';
import puppeteer, {
  type Browser,
  type GoToOptions,
  type LaunchOptions,
  type Page,
} from 'puppeteer';
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

export interface SetupApi {
  url: string;
  browser: Browser;
  puppeteer: typeof puppeteer;
}

export interface CreateWebTestOptions {
  /** Default: `true` in CI, `false` locally. */
  headless?: boolean;
  /** Default: 1920×1080. Routed into the default `launchOptions.defaultViewport`. */
  viewport?: { width: number; height: number };

  launchOptions?: Resolver<LaunchOptions>;
  gotoOptions?: GoToOptions;

  agentOptions?: Omit<WebPageAgentOpt, 'groupName' | 'reportFileName'>;

  /**
   * Take over the per-test page lifecycle. Return the page midscene should
   * drive, plus an optional `teardown` that runs while the page is still
   * alive (before `agent.destroy()`). When provided, midscene skips its
   * default page setup; `headless`, `viewport`, `launchOptions`, and
   * `gotoOptions` are all ignored. Only `agentOptions` still applies.
   */
  setup?: (api: SetupApi) => Promise<{
    page: Page;
    teardown?: (testCtx: RstestTestContext) => Promise<void>;
  }>;
}

export interface WebTestContext {
  readonly agent: PuppeteerAgent;
  /**
   * Raw Puppeteer `Page` for advanced scenarios — `page.setRequestInterception`,
   * `page.evaluate`, etc. Prefer `agent` for AI actions and assertions; reach
   * for `page` only when you need browser-primitive control.
   */
  readonly page: Page;
  /**
   * The file-scoped Puppeteer `Browser`. Use it to open extra pages mid-test
   * (e.g. a second user session via `browser.createBrowserContext()` +
   * `context.newPage()`). Valid between `beforeAll` and `afterAll`.
   */
  readonly browser: Browser;
  /**
   * Build a midscene agent for another page (popup, manually-created page).
   * The agent's report is merged alongside the primary's. Destroy is automatic
   * in `afterEach`.
   */
  agentForPage(
    page: Page,
    opts?: Omit<WebPageAgentOpt, 'groupName' | 'reportFileName'>,
  ): Promise<PuppeteerAgent>;
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
  const page = await api.browser.newPage();
  await page.goto(api.url, opts.gotoOptions);
  return {
    page,
    async teardown() {
      try {
        await page.close();
      } catch {
        // The user's setup teardown may have already closed the page.
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
    PuppeteerAgent,
    Page,
    Browser,
    CreateWebTestOptions
  >(url, merged, {
    async launchBrowser(opts) {
      const launchOptions = await applyResolver(opts.launchOptions, {
        headless: opts.headless ?? isCI,
        args: DEFAULT_BROWSER_ARGS,
        defaultViewport: opts.viewport ?? DEFAULT_VIEWPORT,
      });
      return puppeteer.launch(launchOptions);
    },
    async closeBrowser(browser) {
      await browser.close();
    },
    async createAgent(browser, targetUrl, opts, meta) {
      const setup = opts.setup ?? ((api) => defaultSetup(api, opts));
      const { page, teardown } = await setup({
        url: targetUrl,
        browser,
        puppeteer,
      });

      const agent = new PuppeteerAgent(page, {
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
          new PuppeteerAgent(page, {
            ...merged.agentOptions,
            ...opts,
            groupName: meta.groupName,
            reportFileName: meta.reportFileName,
          }),
      );
    },
  };
}
