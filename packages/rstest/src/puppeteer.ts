import { PuppeteerAgent, type WebPageAgentOpt } from '@midscene/web/puppeteer';
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

export interface SetupApi {
  url: string;
  browser: Browser;
  puppeteer: typeof puppeteer;
}

export interface PageBundle {
  page: Page;
  /** Runs before `agent.destroy()`, while the page is still alive. */
  teardown?: (testCtx: RstestTestContext) => Promise<void>;
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
   * Take over the per-test page lifecycle. When provided, midscene skips its
   * default page setup; `headless`, `viewport`, `launchOptions`, and
   * `gotoOptions` are all ignored. Only `agentOptions` still applies.
   */
  setup?: (api: SetupApi) => Promise<PageBundle>;
}

export interface WebTestContext {
  readonly agent: PuppeteerAgent;
}

const defaultsStore = createDefaultsStore<CreateWebTestOptions>();

/**
 * Project-wide defaults for `createWebTest`. Call from a `setupFiles` entry.
 * Per-call options shallow-merge over these at the top-level key; nested
 * fields like `launchOptions` are replaced, not deep-merged. Use the function
 * form of a resolver to compose with defaults.
 */
export const defineMidsceneDefaults = defaultsStore.define;

async function defaultSetup(
  api: SetupApi,
  opts: CreateWebTestOptions,
): Promise<PageBundle> {
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

  return registerLifecycle<PuppeteerAgent, Browser, CreateWebTestOptions>(
    url,
    merged,
    {
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
        const bundle = await setup({
          url: targetUrl,
          browser,
          puppeteer,
        });

        const agent = new PuppeteerAgent(bundle.page, {
          ...opts.agentOptions,
          groupName: meta.groupName,
          reportFileName: meta.reportFileName,
        });

        return { agent, teardown: bundle.teardown };
      },
    },
  );
}
