import type {
  ChromePageDestroyOptions,
  KeyboardAction,
  MouseAction,
} from '@/page';
import { assert } from '@midscene/shared/utils';
import ChromeExtensionProxyPage from '../chrome-extension/page';
import {
  type BridgeConnectTabOptions,
  BridgeEvent,
  DefaultBridgeServerPort,
  KeyboardEvent,
  MouseEvent,
} from './common';
import { BridgeClient } from './io-client';

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
    this.bridgeClient = new BridgeClient(
      `ws://localhost:${DefaultBridgeServerPort}`,
      async (method, args: any[]) => {
        console.log('bridge call from cli side', method, args);
        if (method === BridgeEvent.ConnectNewTabWithUrl) {
          return this.connectNewTabWithUrl.apply(
            this,
            args as unknown as [string],
          );
        }

        if (method === BridgeEvent.GetBrowserTabList) {
          return this.getBrowserTabList.apply(this, args as any);
        }

        if (method === BridgeEvent.SetActiveTabId) {
          return this.setActiveTabId.apply(this, args as any);
        }

        if (method === BridgeEvent.ConnectCurrentTab) {
          return this.connectCurrentTab.apply(this, args as any);
        }

        if (method === BridgeEvent.UpdateAgentStatus) {
          return this.onLogMessage(args[0] as string, 'status');
        }

        const tabId = await this.getActiveTabId();
        if (!tabId || tabId === 0) {
          throw new Error('no tab is connected');
        }

        // this.onLogMessage(`calling method: ${method}`);

        if (method.startsWith(MouseEvent.PREFIX)) {
          const actionName = method.split('.')[1] as keyof MouseAction;
          if (actionName === 'drag') {
            return this.mouse[actionName].apply(this.mouse, args as any);
          }
          return this.mouse[actionName].apply(this.mouse, args as any);
        }

        if (method.startsWith(KeyboardEvent.PREFIX)) {
          const actionName = method.split('.')[1] as keyof KeyboardAction;
          if (actionName === 'press') {
            return this.keyboard[actionName].apply(this.keyboard, args as any);
          }
          return this.keyboard[actionName].apply(this.keyboard, args as any);
        }

        try {
          // @ts-expect-error
          const result = await this[method as keyof ChromeExtensionProxyPage](
            ...args,
          );
          return result;
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
          console.error('error calling method', method, args, e);
          this.onLogMessage(
            `Error calling method: ${method}, ${errorMessage}`,
            'log',
          );
          throw new Error(errorMessage, { cause: e });
        }
      },
      // on disconnect
      () => {
        return this.destroy();
      },
    );
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
