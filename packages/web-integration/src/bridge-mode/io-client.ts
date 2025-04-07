import type { AbstractPage } from '@/page';
import type { KeyboardAction, MouseAction } from '@/page';
import { assert } from '@midscene/shared/utils';
import { io as ClientIO, type Socket as ClientSocket } from 'socket.io-client';
import {
  type BridgeCallRequest,
  type BridgeCallResponse,
  type BridgeConnectedEventPayload,
  BridgeEvent,
  DefaultBridgeServerPort,
  KeyboardEvent,
  MouseEvent,
} from './common';

declare const __VERSION__: string;

// ws client, this is where the request is processed
export class BridgeClient {
  private socket: ClientSocket | null = null;
  public serverVersion: string | null = null;
  constructor(
    public endpoint: string,
    public onBridgeCall: (method: string, args: any[]) => Promise<any>,
    public onDisconnect?: () => void,
  ) {}

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = ClientIO(this.endpoint, {
        reconnection: false,
        query: {
          version: __VERSION__,
        },
      });

      const timeout = setTimeout(() => {
        try {
          this.socket?.offAny();
          this.socket?.close();
        } catch (e) {
          console.warn('got error when closing socket', e);
        }
        this.socket = null;
        reject(new Error('failed to connect to bridge server after timeout'));
      }, 1 * 1000);

      // on disconnect
      this.socket.on('disconnect', (reason: string) => {
        // console.log('bridge-disconnected, reason:', reason);
        this.socket = null;
        this.onDisconnect?.();
      });

      this.socket.on(
        BridgeEvent.Connected,
        (payload: BridgeConnectedEventPayload) => {
          clearTimeout(timeout);
          // console.log('bridge-connected');
          this.serverVersion = payload?.version || 'unknown';
          resolve(this.socket);
        },
      );
      this.socket.on(BridgeEvent.Refused, (e: any) => {
        console.error('bridge-refused', e);
        reject(new Error(e || 'bridge refused'));
      });
      this.socket.on(BridgeEvent.Call, (call: BridgeCallRequest) => {
        const id = call.id;
        assert(typeof id !== 'undefined', 'call id is required');
        Promise.resolve().then(async () => {
          let response: any;
          try {
            response = await this.onBridgeCall(call.method, call.args);
          } catch (e: any) {
            const errorContent = `Error from bridge client when calling, method: ${call.method}, args: ${call.args}, error: ${e?.message || e}\n${e?.stack || ''}`;
            console.error(errorContent);
            return this.socket?.emit(BridgeEvent.CallResponse, {
              id,
              error: errorContent,
            } as BridgeCallResponse);
          }
          this.socket?.emit(BridgeEvent.CallResponse, {
            id,
            response,
          } as BridgeCallResponse);
        });
      });
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const pageClientConnector = <T extends AbstractPage>(
  page: T,
  options: {
    shouldAnswerMethodCall: (method: string, args: any[]) => Promise<boolean>;
    onMethodCall: (method: string, args: any[]) => Promise<any>;
    onDestroy: () => void;
  },
): BridgeClient => {
  const bridgeClient = new BridgeClient(
    `ws://localhost:${DefaultBridgeServerPort}`,
    async (method, args: any[]) => {
      console.log('bridge call from cli side', method, args);

      if (method === BridgeEvent.UpdateAgentStatus) {
        return page.onLogMessage?.(args[0] as string, 'status');
      }

      if (await options.shouldAnswerMethodCall(method, args)) {
        return options.onMethodCall(method, args);
      }

      // this.onLogMessage(`calling method: ${method}`);

      if (method.startsWith(MouseEvent.PREFIX)) {
        const actionName = method.split('.')[1] as keyof MouseAction;
        if (actionName === 'drag') {
          return page.mouse[actionName].apply(page.mouse, args as any);
        }
        return page.mouse[actionName].apply(page.mouse, args as any);
      }

      if (method.startsWith(KeyboardEvent.PREFIX)) {
        const actionName = method.split('.')[1] as keyof KeyboardAction;
        if (actionName === 'press') {
          return page.keyboard[actionName].apply(page.keyboard, args as any);
        }
        return page.keyboard[actionName].apply(page.keyboard, args as any);
      }

      try {
        // @ts-expect-error
        const result = await page[method as keyof T](...args);
        return result;
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error('error calling method', method, args, e);
        page.onLogMessage?.(
          `Error calling method: ${method}, ${errorMessage}`,
          'log',
        );
        throw new Error(errorMessage, { cause: e });
      }
    },
    // on disconnect
    () => {
      options.onDestroy?.();
    },
  );

  return bridgeClient;
};
