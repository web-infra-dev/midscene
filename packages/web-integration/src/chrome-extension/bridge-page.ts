import assert from 'node:assert';
import { MouseAction } from '@/page';
import { KeyboardAction } from '@/page';
import { DefaultBridgeServerPort } from './bridge-common';
import { BridgeClient } from './bridge-io-client';
import ChromeExtensionProxyPage from './page';

export class ChromeExtensionPageBrowserSide extends ChromeExtensionProxyPage {
  public bridgeClient: BridgeClient | null = null;

  constructor(public onDisconnect: () => void = () => {}) {
    super(0);
  }

  private async setupBridgeClient() {
    this.bridgeClient = new BridgeClient(
      `ws://localhost:${DefaultBridgeServerPort}`,
      async (method, args: any[]) => {
        console.log('bridge call from cli side', method, args);
        if (method === 'connectNewTabWithUrl') {
          return this.connectNewTabWithUrl.apply(
            this,
            args as unknown as [string],
          );
        }

        if (!this.tabId || this.tabId === 0) {
          throw new Error('no tab is connected');
        }

        if (method.startsWith('mouse.')) {
          const actionName = method.split('.')[1] as keyof MouseAction;
          return this.mouse[actionName].apply(this.mouse, args as any);
        }

        if (method.startsWith('keyboard.')) {
          const actionName = method.split('.')[1] as keyof KeyboardAction;
          return this.keyboard[actionName].apply(this.keyboard, args as any);
        }

        // @ts-expect-error
        return this[method as keyof ChromeExtensionProxyPage](...args);
      },
      // on disconnect
      () => {
        this.bridgeClient = null;
        return this.destroy();
      },
    );
    await this.bridgeClient.connect();
  }

  public async connect(timeout = 30 * 1000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        await this.setupBridgeClient();
        console.log('bridge client connected');
        return;
      } catch (e) {
        console.error('failed to connect to bridge server', e);
      }
      // wait for 300ms before retrying
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`failed to connect to bridge server after ${timeout}ms`);
  }

  public async connectNewTabWithUrl(url: string) {
    assert(url, 'url is required to create a new tab');
    if (this.tabId) {
      throw new Error('tab is already connected');
    }

    // new tab
    const tab = await chrome.tabs.create({ url });
    const tabId = tab.id;
    assert(tabId, 'failed to get tabId after creating a new tab');

    this.tabId = tabId;
  }

  async destroy() {
    if (this.bridgeClient) {
      this.bridgeClient.disconnect();
      this.bridgeClient = null;
    }
    super.destroy();
    this.tabId = 0;
    this.onDisconnect();
  }
}
