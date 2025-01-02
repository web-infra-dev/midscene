import assert from 'node:assert';
import { PageAgent } from '@/common/agent';
import type { KeyboardAction, MouseAction } from '@/page';
import { DefaultBridgeServerPort } from './common';
import { BridgeServer } from './io-server';
import type { ChromeExtensionPageBrowserSide } from './page-browser-side';

// actually, this is a proxy to the page in browser side
export const getBridgePageInCliSide = (): ChromeExtensionPageBrowserSide => {
  const server = new BridgeServer(DefaultBridgeServerPort);
  server.listen();
  const bridgeCaller = (method: string) => {
    return async (...args: any[]) => {
      const response = await server.call(method, args);
      return response;
    };
  };
  const page = {};

  return new Proxy(page, {
    get(target, prop, receiver) {
      assert(typeof prop === 'string', 'prop must be a string');

      if (prop === 'toJSON') {
        return () => {
          return {
            pageType: 'page-over-chrome-extension-bridge',
          };
        };
      }

      if (prop === '_forceUsePageContext') {
        return undefined;
      }

      if (Object.keys(page).includes(prop)) {
        return page[prop as keyof typeof page];
      }

      if (prop === 'pageType') {
        return 'page-over-chrome-extension-bridge';
      }

      if (prop === 'mouse') {
        const mouse: MouseAction = {
          click: bridgeCaller('mouse.click'),
          wheel: bridgeCaller('mouse.wheel'),
          move: bridgeCaller('mouse.move'),
        };
        return mouse;
      }

      if (prop === 'keyboard') {
        const keyboard: KeyboardAction = {
          type: bridgeCaller('keyboard.type'),
          press: bridgeCaller('keyboard.press'),
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
  }) as ChromeExtensionPageBrowserSide;
};

export class ChromePageOverBridgeAgent extends PageAgent {
  constructor() {
    const page = getBridgePageInCliSide();
    super(page, {});
  }

  async connectNewTabWithUrl(url: string) {
    await (this.page as ChromeExtensionPageBrowserSide).connectNewTabWithUrl(
      url,
    );
  }
}
