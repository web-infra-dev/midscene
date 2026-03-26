import { assert } from '@midscene/shared/utils';
import ChromeExtensionProxyPage from '../chrome-extension/page';
import { ScrollMethod } from '../web-element';
import type {
  ChromePageDestroyOptions,
  KeyboardAction,
  MouseAction,
} from '../web-page';
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

  // Connection confirmation state
  private confirmationPromise: Promise<boolean> | null = null;

  constructor(
    public serverEndpoint?: string,
    public onDisconnect: () => void = () => {},
    public onLogMessage: (
      message: string,
      type: 'log' | 'status',
    ) => void = () => {},
    forceSameTabNavigation = true,
    scrollMethod: ScrollMethod = ScrollMethod.Wheel,
    public onConnectionRequest?: () => Promise<boolean>,
  ) {
    super(forceSameTabNavigation, scrollMethod);
  }

  private async setupBridgeClient() {
    const endpoint =
      this.serverEndpoint || `ws://localhost:${DefaultBridgeServerPort}`;

    // Create confirmation gate BEFORE establishing connection,
    // so that any calls received immediately after connection are blocked
    // until user confirms. This prevents a race condition where server-side
    // queued calls bypass the confirmation dialog.
    let resolveConfirmationGate: (allowed: boolean) => void = () => {};
    if (this.onConnectionRequest) {
      this.confirmationPromise = new Promise<boolean>((resolve) => {
        resolveConfirmationGate = resolve;
      });
    }

    this.bridgeClient = new BridgeClient(
      endpoint,
      async (method, args: any[]) => {
        // Wait for user confirmation before processing any commands
        if (this.confirmationPromise) {
          const allowed = await this.confirmationPromise;
          if (!allowed) {
            throw new Error('Connection denied by user');
          }
        }

        this.onLogMessage(`bridge call from cli side: ${method}`, 'log');
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

        if (!this[method as keyof ChromeExtensionProxyPage]) {
          this.onLogMessage(`method not found: ${method}`, 'log');
          return undefined;
        }

        try {
          // @ts-expect-error
          const result = await this[method as keyof ChromeExtensionProxyPage](
            ...args,
          );
          return result;
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown error';
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

    // Show confirmation dialog after connection is established
    if (this.onConnectionRequest) {
      this.onLogMessage('Waiting for user confirmation...', 'log');
      const allowed = await this.onConnectionRequest();
      resolveConfirmationGate(allowed);
      this.confirmationPromise = null;

      if (!allowed) {
        this.onLogMessage('Connection denied by user', 'log');
        this.bridgeClient.disconnect();
        this.bridgeClient = null;
        throw new Error('Connection denied by user');
      }
    }

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
    if (options?.scrollMethod) {
      this.scrollMethod = options.scrollMethod;
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
    if (options?.scrollMethod) {
      this.scrollMethod = options.scrollMethod;
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
