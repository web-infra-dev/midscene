import { PageAgent, type PageAgentOpt } from '@/common/agent';
import { commonWebActionsForWebPage } from '@/common/utils';
import type { KeyboardAction, MouseAction } from '@/page';
import type { DeviceAction, ExecutorContext } from '@midscene/core';
import { assert } from '@midscene/shared/utils';
import {
  type BridgeConnectTabOptions,
  BridgeEvent,
  BridgePageType,
  DefaultBridgeServerPort,
  KeyboardEvent,
  MouseEvent,
} from './common';
import { BridgeServer } from './io-server';
import type { ExtensionBridgePageBrowserSide } from './page-browser-side';

interface ChromeExtensionPageCliSide extends ExtensionBridgePageBrowserSide {
  showStatusMessage: (message: string) => Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// actually, this is a proxy to the page in browser side
export const getBridgePageInCliSide = (
  timeout?: number | false,
  closeConflictServer?: boolean,
): ChromeExtensionPageCliSide => {
  const server = new BridgeServer(
    DefaultBridgeServerPort,
    undefined,
    undefined,
    closeConflictServer,
  );
  server.listen({
    timeout,
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
            pageType: BridgePageType,
          };
        };
      }

      if (prop === 'pageType') {
        return BridgePageType;
      }

      if (prop === '_forceUsePageContext') {
        return undefined;
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

export class AgentOverChromeBridge extends PageAgent<ChromeExtensionPageCliSide> {
  private destroyAfterDisconnectFlag?: boolean;

  constructor(
    opts?: PageAgentOpt & {
      closeNewTabsAfterDisconnect?: boolean;
      serverListeningTimeout?: number | false;
      closeConflictServer?: boolean;
    },
  ) {
    const page = getBridgePageInCliSide(opts?.serverListeningTimeout);
    super(
      page,
      Object.assign(opts || {}, {
        onTaskStartTip: (tip: string) => {
          this.page.showStatusMessage(tip);
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

  async aiAction(prompt: string, options?: any) {
    if (options) {
      console.warn(
        'the `options` parameter of aiAction is not supported in cli side',
      );
    }
    return await super.aiAction(prompt);
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
