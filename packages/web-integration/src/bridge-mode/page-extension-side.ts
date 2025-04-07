import type { ChromePageDestroyOptions } from '@/page';
import { assert } from '@midscene/shared/utils';
import ChromeExtensionProxyPage from '../chrome-extension/page';
import { type BridgeConnectTabOptions, BridgeEvent } from './common';
import { type BridgeClient, pageClientConnector } from './io-client';

declare const __VERSION__: string;

export class ExtensionBridgePageBrowserSide extends ChromeExtensionProxyPage {
  public bridgeClient: BridgeClient | null = null;

  private destroyOptions?: ChromePageDestroyOptions;

  private newlyCreatedTabIds: number[] = [];

  constructor(
    public onDisconnect: () => void = () => {},
    public onLogMessage: (
      message: string,
      type: 'log' | 'status',
    ) => void = () => {},
    forceSameTabNavigation = true,
  ) {
    super(forceSameTabNavigation);
  }

  private async setupBridgeClient() {
    this.bridgeClient = pageClientConnector<ChromeExtensionProxyPage>(this, {
      shouldAnswerMethodCall: async (method, args) => {
        const page = this;
        if (method === BridgeEvent.ConnectNewTabWithUrl) {
          return true;
        }
        if (method === BridgeEvent.ConnectCurrentTab) {
          return true;
        }

        const tabId = await page.getActiveTabId();
        if (!tabId || tabId === 0) {
          throw new Error('no tab is connected');
        }

        return false;
      },
      onMethodCall: async (method, args) => {
        const page = this;
        if (method === BridgeEvent.ConnectNewTabWithUrl) {
          return page.connectNewTabWithUrl.apply(
            page,
            args as unknown as [string],
          );
        }

        if (method === BridgeEvent.ConnectCurrentTab) {
          return page.connectCurrentTab.apply(page, args as any);
        }
      },
      onDestroy: () => {
        return this.destroy();
      },
    });
    await this.bridgeClient.connect();
    this.onLogMessage(
      `Bridge connected, cli-side version v${this.bridgeClient.serverVersion}, browser-side version v${__VERSION__}`,
      'log',
    );
  }

  public async connect() {
    return await this.setupBridgeClient();
  }

  public async connectNewTabWithUrl(
    url: string,
    options: BridgeConnectTabOptions = {
      forceSameTabNavigation: true,
    },
  ) {
    const tab = await chrome.tabs.create({ url });
    const tabId = tab.id;
    assert(tabId, 'failed to get tabId after creating a new tab');

    // new tab
    this.onLogMessage(`Creating new tab: ${url}`, 'log');
    this.newlyCreatedTabIds.push(tabId);

    if (options?.forceSameTabNavigation) {
      this.forceSameTabNavigation = true;
    }

    await this.setActiveTabId(tabId);
  }

  public async connectCurrentTab(
    options: BridgeConnectTabOptions = {
      forceSameTabNavigation: true,
    },
  ) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('current tab', tabs);
    const tabId = tabs[0]?.id;
    assert(tabId, 'failed to get tabId');

    this.onLogMessage(`Connected to current tab: ${tabs[0]?.url}`, 'log');

    if (options?.forceSameTabNavigation) {
      this.forceSameTabNavigation = true;
    }
    await this.setActiveTabId(tabId);
  }

  public async setDestroyOptions(options: ChromePageDestroyOptions) {
    this.destroyOptions = options;
  }

  async destroy() {
    if (this.destroyOptions?.closeTab && this.newlyCreatedTabIds.length > 0) {
      this.onLogMessage('Closing all newly created tabs by bridge...', 'log');
      for (const tabId of this.newlyCreatedTabIds) {
        await chrome.tabs.remove(tabId);
      }
      this.newlyCreatedTabIds = [];
    }

    await super.destroy();

    if (this.bridgeClient) {
      this.bridgeClient.disconnect();
      this.bridgeClient = null;
      this.onDisconnect();
    }
  }
}
