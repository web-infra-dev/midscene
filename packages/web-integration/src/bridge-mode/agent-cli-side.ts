import { Agent, type AgentOpt } from '@midscene/core/agent';
import { assert } from '@midscene/shared/utils';
import { commonWebActionsForWebPage } from '../web-page';
import type { KeyboardAction, MouseAction } from '../web-page';
import {
  type BridgeConnectTabOptions,
  BridgeEvent,
  BridgePageType,
  DefaultBridgeServerHost,
  DefaultBridgeServerPort,
  KeyboardEvent,
  MouseEvent,
  getBridgeServerHost,
} from './common';
import { BridgeServer } from './io-server';
import type { ExtensionBridgePageBrowserSide } from './page-browser-side';

interface ChromeExtensionPageCliSide extends ExtensionBridgePageBrowserSide {
  showStatusMessage: (message: string) => Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// actually, this is a proxy to the page in browser side
export const getBridgePageInCliSide = (options?: {
  host?: string;
  port?: number;
  timeout?: number | false;
  closeConflictServer?: boolean;
}): ChromeExtensionPageCliSide => {
  const host = options?.host || DefaultBridgeServerHost;
  const port = options?.port || DefaultBridgeServerPort;
  const server = new BridgeServer(
    host,
    port,
    undefined,
    undefined,
    options?.closeConflictServer,
  );
  server.listen({
    timeout: options?.timeout,
  });
  const bridgeCaller = (method: string) => {
    return async (...args: any[]) => {
      const response = await server.call(method, args);
      return response;
    };
  };
  const page = {
    showStatusMessage: async (message: string) => {
      await server.call(BridgeEvent.UpdateAgentStatus, [message]);
    },
  };

  const proxyPage = new Proxy(page, {
    get(target, prop, receiver) {
      assert(typeof prop === 'string', 'prop must be a string');

      if (prop === 'toJSON') {
        return () => {
          return {
            interfaceType: BridgePageType,
          };
        };
      }

      if (prop === 'getContext') {
        return undefined;
      }

      if (prop === 'interfaceType') {
        return BridgePageType;
      }

      if (prop === 'actionSpace') {
        return () => commonWebActionsForWebPage(proxyPage);
      }

      if (Object.keys(page).includes(prop)) {
        return page[prop as keyof typeof page];
      }

      if (prop === 'mouse') {
        const mouse: MouseAction = {
          click: bridgeCaller(MouseEvent.Click),
          wheel: bridgeCaller(MouseEvent.Wheel),
          move: bridgeCaller(MouseEvent.Move),
          drag: bridgeCaller(MouseEvent.Drag),
        };
        return mouse;
      }

      if (prop === 'keyboard') {
        const keyboard: KeyboardAction = {
          type: bridgeCaller(KeyboardEvent.Type),
          press: bridgeCaller(KeyboardEvent.Press),
        };
        return keyboard;
      }

      if (prop === 'destroy') {
        return async (...args: any[]) => {
          try {
            const caller = bridgeCaller('destroy');
            await caller(...args);
          } catch (e) {
            // console.error('error calling destroy', e);
          }
          return server.close();
        };
      }

      return bridgeCaller(prop);
    },
  }) as ChromeExtensionPageCliSide;

  return proxyPage;
};

export class AgentOverChromeBridge extends Agent<ChromeExtensionPageCliSide> {
  private destroyAfterDisconnectFlag?: boolean;

  constructor(
    opts?: AgentOpt & {
      /**
       * Enable remote access to the bridge server.
       * - false (default): Only localhost can connect (most secure)
       * - true: Allow remote machines to connect (binds to 0.0.0.0)
       */
      allowRemoteAccess?: boolean;
      /**
       * Custom host to bind the bridge server to.
       * Overrides allowRemoteAccess if specified.
       */
      host?: string;
      /**
       * Custom port for the bridge server.
       * @default 3766
       */
      port?: number;
      closeNewTabsAfterDisconnect?: boolean;
      serverListeningTimeout?: number | false;
      closeConflictServer?: boolean;
    },
  ) {
    const host = getBridgeServerHost({
      host: opts?.host,
      allowRemoteAccess: opts?.allowRemoteAccess,
    });
    const page = getBridgePageInCliSide({
      host,
      port: opts?.port,
      timeout: opts?.serverListeningTimeout,
      closeConflictServer: opts?.closeConflictServer,
    });
    const originalOnTaskStartTip = opts?.onTaskStartTip;
    super(
      page,
      Object.assign(opts || {}, {
        onTaskStartTip: (tip: string) => {
          this.page.showStatusMessage(tip);
          if (originalOnTaskStartTip) {
            originalOnTaskStartTip?.call(this, tip);
          }
        },
      }),
    );
    this.destroyAfterDisconnectFlag = opts?.closeNewTabsAfterDisconnect;
  }

  async setDestroyOptionsAfterConnect() {
    if (this.destroyAfterDisconnectFlag) {
      this.page.setDestroyOptions({
        closeTab: true,
      });
    }
  }

  async connectNewTabWithUrl(url: string, options?: BridgeConnectTabOptions) {
    await this.page.connectNewTabWithUrl(url, options);
    await sleep(500);
    await this.setDestroyOptionsAfterConnect();
  }

  async getBrowserTabList() {
    return await this.page.getBrowserTabList();
  }

  async setActiveTabId(tabId: string) {
    return await this.page.setActiveTabId(Number.parseInt(tabId));
  }

  async connectCurrentTab(options?: BridgeConnectTabOptions) {
    await this.page.connectCurrentTab(options);
    await sleep(500);
    await this.setDestroyOptionsAfterConnect();
  }

  async aiAct(prompt: string, options?: any) {
    if (options) {
      console.warn(
        'the `options` parameter of aiAct is not supported in cli side',
      );
    }
    return await super.aiAct(prompt);
  }

  async destroy(closeNewTabsAfterDisconnect?: boolean) {
    if (typeof closeNewTabsAfterDisconnect === 'boolean') {
      await this.page.setDestroyOptions({
        closeTab: closeNewTabsAfterDisconnect,
      });
    }
    await super.destroy();
  }
}
