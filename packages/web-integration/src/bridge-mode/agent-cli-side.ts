import assert from 'node:assert';
import { PageAgent } from '@/common/agent';
import { paramStr, typeStr } from '@/common/ui-utils';
import type { KeyboardAction, MouseAction } from '@/page';
import {
  BridgeEvent,
  BridgePageType,
  DefaultBridgeServerPort,
  KeyboardEvent,
  MouseEvent,
} from './common';
import { BridgeServer } from './io-server';
import type { ChromeExtensionPageBrowserSide } from './page-browser-side';

interface ChromeExtensionPageCliSide extends ChromeExtensionPageBrowserSide {
  showStatusMessage: (message: string) => Promise<void>;
}

// actually, this is a proxy to the page in browser side
export const getBridgePageInCliSide = (): ChromeExtensionPageCliSide => {
  const server = new BridgeServer(DefaultBridgeServerPort);
  server.listen();
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

  return new Proxy(page, {
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

      if (Object.keys(page).includes(prop)) {
        return page[prop as keyof typeof page];
      }

      if (prop === 'mouse') {
        const mouse: MouseAction = {
          click: bridgeCaller(MouseEvent.Click),
          wheel: bridgeCaller(MouseEvent.Wheel),
          move: bridgeCaller(MouseEvent.Move),
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
        return async () => {
          try {
            await bridgeCaller('destroy');
          } catch (e) {
            console.error('error calling destroy', e);
          }
          return server.close();
        };
      }

      return bridgeCaller(prop);
    },
  }) as ChromeExtensionPageCliSide;
};

export class AgentOverChromeBridge extends PageAgent<ChromeExtensionPageCliSide> {
  constructor() {
    const page = getBridgePageInCliSide();
    super(page, {});
  }

  async connectNewTabWithUrl(url: string) {
    await this.page.connectNewTabWithUrl(url);
  }

  async connectCurrentTab() {
    await this.page.connectCurrentTab();
  }

  async aiAction(prompt: string, options?: any) {
    if (options) {
      console.warn(
        'the `options` parameter of aiAction is not supported in cli side',
      );
    }
    return await super.aiAction(prompt, {
      onTaskStart: (task) => {
        const tip = `${typeStr(task)} - ${paramStr(task)}`;
        this.page.showStatusMessage(tip);
      },
    });
  }
}
