import type { Browser, Page } from 'puppeteer';
import type { CdpConfig, LaunchConfig } from './types';

export class AgentProxy {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private innerAgent: any = null;
  private isOwned = false;

  async connect(config?: CdpConfig): Promise<void> {
    // Clean up existing connections before creating new ones
    await this.destroy();

    const endpoint = this.resolveEndpoint(config);

    if (endpoint instanceof Promise) {
      await this.connectToEndpoint(await endpoint);
      return;
    }

    await this.connectToEndpoint(endpoint);

    if (
      typeof config === 'object' &&
      (config.tabUrl || typeof config.tabIndex === 'number')
    ) {
      await this.selectTab(config);
    }
  }

  private validateWebSocketEndpoint(endpoint: string): void {
    if (!/^wss?:\/\//.test(endpoint)) {
      throw new Error(
        `Invalid WebSocket endpoint URL: "${endpoint}". Expected a URL starting with "ws://" or "wss://".`,
      );
    }
  }

  private resolveEndpoint(config?: CdpConfig): string | Promise<string> {
    if (!config) {
      return this.discoverLocal();
    }

    if (typeof config === 'string') {
      this.validateWebSocketEndpoint(config);
      return config;
    }

    this.validateWebSocketEndpoint(config.endpoint);

    if (!config.apiKey) {
      return config.endpoint;
    }

    const url = new URL(config.endpoint);
    url.searchParams.set('apiKey', config.apiKey);
    return url.toString();
  }

  async launch(config: LaunchConfig = {}): Promise<void> {
    // Clean up existing connections before creating new ones
    await this.destroy();

    const puppeteer = await import('puppeteer');

    this.browser = await puppeteer.default.launch({
      headless: !config.headed,
    });
    this.isOwned = true;

    this.page = await this.browser.newPage();

    if (config.viewport) {
      await this.page.setViewport(config.viewport);
    }

    if (config.url) {
      await this.page.goto(config.url, { waitUntil: 'domcontentloaded' });
    }

    await this.createAgent();
  }

  async aiAct(prompt: string, options?: any): Promise<any> {
    this.ensureConnected();
    return this.innerAgent.aiAct(prompt, options);
  }

  async aiAction(prompt: string, options?: any): Promise<any> {
    this.ensureConnected();
    return this.innerAgent.aiAction(prompt, options);
  }

  async aiQuery<T = any>(prompt: string, options?: any): Promise<T> {
    this.ensureConnected();
    return this.innerAgent.aiQuery(prompt, options);
  }

  async aiAssert(assertion: string, options?: any): Promise<void> {
    this.ensureConnected();
    return this.innerAgent.aiAssert(assertion, options);
  }

  async aiLocate(prompt: string, options?: any): Promise<any> {
    this.ensureConnected();
    return this.innerAgent.aiLocate(prompt, options);
  }

  async aiWaitFor(assertion: string, options?: any): Promise<void> {
    this.ensureConnected();
    return this.innerAgent.aiWaitFor(assertion, options);
  }

  async destroy(): Promise<void> {
    if (this.innerAgent) {
      await this.innerAgent.destroy();
      this.innerAgent = null;
    }

    if (this.browser) {
      if (this.isOwned) {
        await this.browser.close();
      } else {
        this.browser.disconnect();
      }
      this.browser = null;
    }

    this.page = null;
  }

  private async discoverLocal(port = 9222): Promise<string> {
    const response = await fetch(`http://localhost:${port}/json/version`);
    if (!response.ok) {
      throw new Error(
        `Cannot connect to local Chrome (port ${port}).

Midscene connects to Chrome using its remote debugging protocol, which must be enabled.
Please start Chrome with remote debugging enabled using one of the following commands:
  macOS: open -a "Google Chrome" --args --remote-debugging-port=${port}
  Linux: google-chrome --remote-debugging-port=${port}
  Windows: chrome.exe --remote-debugging-port=${port}

For more information, see: https://midscenejs.com/automate-with-scripts-in-yaml.html`,
      );
    }
    const info = (await response.json()) as { webSocketDebuggerUrl: string };
    return info.webSocketDebuggerUrl;
  }

  private async connectToEndpoint(endpoint: string): Promise<void> {
    const puppeteer = await import('puppeteer');

    this.browser = await puppeteer.default.connect({
      browserWSEndpoint: endpoint,
    });
    this.isOwned = false;

    const pages = await this.browser.pages();
    this.page = pages[0] || (await this.browser.newPage());
    await this.createAgent();
  }

  private async selectTab(config: {
    tabUrl?: string;
    tabIndex?: number;
  }): Promise<void> {
    if (!this.browser) return;

    const pages = await this.browser.pages();
    let targetPage: Page | undefined;

    if (config.tabUrl) {
      targetPage = pages.find((p) => p.url().includes(config.tabUrl!));
    } else if (typeof config.tabIndex === 'number') {
      targetPage = pages[config.tabIndex];
    }

    if (targetPage) {
      this.page = targetPage;
      await this.createAgent();
    }
  }

  private async createAgent(): Promise<void> {
    if (!this.page) {
      throw new Error('Cannot create agent: no active page is available');
    }
    const { PuppeteerAgent } = await import('@midscene/web/puppeteer');
    this.innerAgent = new PuppeteerAgent(this.page);
  }

  private ensureConnected(): void {
    if (!this.innerAgent) {
      throw new Error(
        'Please call agent.connect() or agent.launch() first to connect to a browser',
      );
    }
  }
}
