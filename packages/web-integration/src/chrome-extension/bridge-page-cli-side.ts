import assert from 'node:assert';
import type { KeyboardAction, MouseAction } from '@/page';
import { DefaultBridgeServerPort } from './bridge-common';
import { BridgeServer } from './bridge-io-server';
import type { ChromeExtensionPageBrowserSide } from './bridge-page-browser-side';

// TODO: handle the connection timeout
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
