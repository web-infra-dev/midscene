import type { KeyboardAction, MouseAction } from '@/page';
import { assert } from '@midscene/shared/utils';
import {
  BridgeEvent,
  BridgePageType,
  DefaultBridgeServerPort,
  KeyboardEvent,
  MouseEvent,
} from './common';
import { BridgeServer } from './io-server';

// this is a proxy to the page in remote device / browser
export const getBridgePageInCliSide = <T>(): T => {
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
  }) as T;
};
