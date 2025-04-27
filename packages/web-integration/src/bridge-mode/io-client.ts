import { assert } from '@midscene/shared/utils';
import { io as ClientIO, type Socket as ClientSocket } from 'socket.io-client';
import {
  type BridgeCallRequest,
  type BridgeCallResponse,
  type BridgeConnectedEventPayload,
  BridgeEvent,
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
          console.warn('got error when offing socket', e);
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

      this.socket.on('connect_error', (e: any) => {
        console.error('bridge-connect-error', e);
        reject(new Error(e || 'bridge connect error'));
      });

      this.socket.on(
        BridgeEvent.Connected,
        (payload: BridgeConnectedEventPayload) => {
          clearTimeout(timeout);
          this.serverVersion = payload?.version || 'unknown';
          resolve(this.socket);
        },
      );
      this.socket.on(BridgeEvent.Refused, (e: any) => {
        console.error('bridge-refused', e);
        try {
          this.socket?.disconnect();
        } catch (e) {
          // console.warn('got error when disconnecting socket', e);
        }
        reject(new Error(e || 'bridge refused'));
      });
      this.socket.on(BridgeEvent.Call, (call: BridgeCallRequest) => {
        const id = call.id;
        assert(typeof id !== 'undefined', 'call id is required');
        (async () => {
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
        })();
      });
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}
