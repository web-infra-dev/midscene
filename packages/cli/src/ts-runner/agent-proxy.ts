import type { Browser, Page } from 'puppeteer';
import type { CdpConfig, LaunchConfig } from './types';

class AgentProxyBase {
  private browser: Browser | null = null;
  private page: Page | null = null;
  innerAgent: any = null;
  private isOwned = false;

  async connect(config?: CdpConfig): Promise<void> {
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

    let url: URL;
    try {
      url = new URL(config.endpoint);
    } catch {
      throw new Error(
        `Invalid WebSocket endpoint URL: "${config.endpoint}". Please provide a valid URL.`,
      );
    }
    url.searchParams.set('apiKey', config.apiKey);
    return url.toString();
  }

  async launch(config: LaunchConfig = {}): Promise<void> {
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
    const errorMessage = `Cannot connect to local Chrome (port ${port}).

Midscene connects to Chrome using its remote debugging protocol, which must be enabled.
Please start Chrome with remote debugging enabled using one of the following commands:
  macOS: open -a "Google Chrome" --args --remote-debugging-port=${port}
  Linux: google-chrome --remote-debugging-port=${port}
  Windows: chrome.exe --remote-debugging-port=${port}

For more information, see: https://midscenejs.com/automate-with-scripts-in-yaml.html`;

    let response: Response;
    try {
      response = await fetch(`http://localhost:${port}/json/version`);
    } catch {
      throw new Error(errorMessage);
    }
    if (!response.ok) {
      throw new Error(errorMessage);
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
      // Destroy existing agent before creating new one to prevent resource leak
      if (this.innerAgent) {
        await this.innerAgent.destroy();
        this.innerAgent = null;
      }
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

  ensureConnected(): void {
    if (!this.innerAgent) {
      throw new Error(
        'Please call agent.connect() or agent.launch() first to connect to a browser',
      );
    }
  }
}

// Create a proxy factory that auto-delegates all methods to innerAgent
function createAgentProxy(): AgentProxyBase {
  const instance = new AgentProxyBase();

  return new Proxy(instance, {
    get(target, prop, receiver) {
      // First check if property exists on AgentProxyBase itself
      if (prop in target) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      }

      // Auto-delegate all methods/properties to innerAgent
      if (target.innerAgent && prop in target.innerAgent) {
        const value = target.innerAgent[prop];
        if (typeof value === 'function') {
          return (...args: any[]) => {
            target.ensureConnected();
            return value.apply(target.innerAgent, args);
          };
        }
        return value;
      }

      // For AI methods accessed before connection, return a function that throws
      if (typeof prop === 'string' && prop.startsWith('ai')) {
        return (...args: any[]) => {
          target.ensureConnected();
        };
      }

      return undefined;
    },
  }) as AgentProxyBase;
}

// Export the proxy factory as the AgentProxy class
export const AgentProxy = function (this: any) {
  return createAgentProxy();
} as any as { new (): AgentProxyBase };
