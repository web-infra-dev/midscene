import assert from 'node:assert';
import type { KeyboardAction, MouseAction } from '@/page';
import { DefaultBridgeServerPort } from './bridge-common';
import { BridgeServer } from './bridge-io-server';

// TODO: handle the connection timeout
export const getBridgePageInCliSide = () => {
  const server = new BridgeServer(DefaultBridgeServerPort);

  server.listen();
  const bridgeCaller = (method: string) => {
    return async (...args: any[]) => {
      const response = await server.call(method, args);
      return response;
    };
  };
  const page = {};
  // const page = {
  //   pendingCalls: [] as BridgeCall[],
  //   listen: () => {
  //     const io = new Server(DefaultBridgeServerPort);
  //     io.on('connection', (socket) => {
  //       socket.emit('bridge-connected', tabId);
  //     });
  //   },
  // };
  return new Proxy(page, {
    get(target, prop, receiver) {
      assert(typeof prop === 'string', 'prop must be a string');

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

      return bridgeCaller(prop);
    },
  });
};
