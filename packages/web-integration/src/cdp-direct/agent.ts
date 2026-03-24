import { Agent, type AgentOpt } from '@midscene/core/agent';
import type { Browser } from 'puppeteer-core';
import {
  type CDPConnectOptions,
  type CDPLaunchOptions,
  connectToChrome,
  launchChrome,
} from './connection';
import { CDPDirectPage, type TabInfo } from './page';

export class CDPDirectAgent extends Agent<CDPDirectPage> {
  private browser: Browser;
  private shouldCloseBrowser: boolean;

  private constructor(
    page: CDPDirectPage,
    browser: Browser,
    shouldCloseBrowser: boolean,
    opts?: AgentOpt,
  ) {
    super(page, opts);
    this.browser = browser;
    this.shouldCloseBrowser = shouldCloseBrowser;
  }

  /**
   * Connect to an existing Chrome instance.
   *
   * @example
   * // Connect by port
   * const agent = await CDPDirectAgent.connect({ port: 9222 });
   *
   * // Connect by WebSocket endpoint
   * const agent = await CDPDirectAgent.connect({ browserWSEndpoint: 'ws://...' });
   *
   * // Connect by user data directory (auto-discovers port)
   * const agent = await CDPDirectAgent.connect({ userDataDir: '/path/to/profile' });
   */
  static async connect(
    opts?: AgentOpt & CDPConnectOptions,
  ): Promise<CDPDirectAgent> {
    const { browserWSEndpoint, port, userDataDir, ...rest } = opts || {};
    const agentOpts = rest as AgentOpt;
    const browser = await connectToChrome({
      browserWSEndpoint,
      port,
      userDataDir,
    });
    const pages = await browser.pages();
    const activePage =
      pages.length > 0 ? pages[pages.length - 1] : await browser.newPage();
    const page = new CDPDirectPage(browser, activePage);
    return new CDPDirectAgent(page, browser, false, agentOpts);
  }

  /**
   * Launch a new Chrome instance.
   *
   * @example
   * // Launch with user data dir to preserve sessions
   * const agent = await CDPDirectAgent.launch({ userDataDir: '/path/to/profile' });
   *
   * // Launch headless
   * const agent = await CDPDirectAgent.launch({ headless: true });
   */
  static async launch(
    opts?: AgentOpt & CDPLaunchOptions,
  ): Promise<CDPDirectAgent> {
    const { headless, userDataDir, executablePath, chromeArgs, ...rest } =
      opts || {};
    const agentOpts = rest as AgentOpt;
    const browser = await launchChrome({
      headless,
      userDataDir,
      executablePath,
      chromeArgs,
    });
    const pages = await browser.pages();
    const activePage = pages.length > 0 ? pages[0] : await browser.newPage();
    const page = new CDPDirectPage(browser, activePage);
    return new CDPDirectAgent(page, browser, true, agentOpts);
  }

  async connectNewTabWithUrl(url: string): Promise<void> {
    await this.page.connectNewTabWithUrl(url);
  }

  async connectCurrentTab(): Promise<void> {
    await this.page.connectCurrentTab();
  }

  async getBrowserTabList(): Promise<TabInfo[]> {
    return this.page.getBrowserTabList();
  }

  async switchToTab(tabId: string): Promise<void> {
    await this.page.switchToTab(tabId);
  }

  async destroy(): Promise<void> {
    await super.destroy();
    if (this.shouldCloseBrowser) {
      await this.browser.close();
    } else {
      // In connect mode, disconnect from the browser without closing it
      await this.browser.disconnect();
    }
  }
}
