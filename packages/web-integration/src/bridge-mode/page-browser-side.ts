import assert from 'node:assert';
import type { KeyboardAction, MouseAction } from '@/page';
import ChromeExtensionProxyPage from '../chrome-extension/page';
import {
  BridgeUpdateAgentStatusEvent,
  DefaultBridgeServerPort,
} from './common';
import { BridgeClient } from './io-client';

export class ChromeExtensionPageBrowserSide extends ChromeExtensionProxyPage {
  public bridgeClient: BridgeClient | null = null;

  constructor(
    public onDisconnect: () => void = () => {},
    public onLogMessage: (
      message: string,
      type: 'log' | 'status',
    ) => void = () => {},
  ) {
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

        if (method === BridgeUpdateAgentStatusEvent) {
          return this.onLogMessage(args[0] as string, 'status');
        }

        if (!this.tabId || this.tabId === 0) {
          throw new Error('no tab is connected');
        }

        // this.onLogMessage(`calling method: ${method}`);

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
        return this.destroy();
      },
    );
    await this.bridgeClient.connect();
  }

  public async connect() {
    return await this.setupBridgeClient();
  }

  public async connectNewTabWithUrl(url: string) {
    assert(url, 'url is required to create a new tab');
    if (this.tabId) {
      throw new Error('tab is already connected');
    }

    const tab = await chrome.tabs.create({ url });
    const tabId = tab.id;
    assert(tabId, 'failed to get tabId after creating a new tab');
    this.tabId = tabId;

    // new tab
    this.onLogMessage(`Creating new tab: ${url}`, 'log');
  }

  async destroy() {
    if (this.bridgeClient) {
      this.bridgeClient.disconnect();
      this.bridgeClient = null;
      this.onDisconnect();
    }
    super.destroy();
    this.tabId = 0;
  }
}
