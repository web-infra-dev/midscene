import assert from 'node:assert';
import { DefaultBridgeServerPort } from './bridge-common';
import { BridgeClient } from './bridge-io-client';
import ChromeExtensionProxyPage from './page';

export class ChromeExtensionPageBridgeSide extends ChromeExtensionProxyPage {
  public bridgeClient: BridgeClient | null = null;

  constructor() {
    super(0);
  }

  private async setupBridgeClient() {
    this.bridgeClient = new BridgeClient(
      `ws://localhost:${DefaultBridgeServerPort}`,
      (method, args: any[]) => {
        if (method === 'newTabWithUrl') {
          return this.connectNewTabWithUrl.apply(
            this,
            args as unknown as [string],
          );
        }

        if (!this.tabId || this.tabId === 0) {
          throw new Error('no tab is connected');
        }

        // @ts-expect-error
        return this[method as keyof ChromeExtensionProxyPage](...args);
      },
    );
    await this.bridgeClient.connect();
  }

  public async connect(timeout = 30 * 1000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        await this.setupBridgeClient();
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

  disconnect() {
    if (this.bridgeClient) {
      this.bridgeClient.disconnect();
    }
    this.tabId = 0;
  }
}
