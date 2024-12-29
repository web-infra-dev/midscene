import assert from 'node:assert';
import { io as ClientIO, type Socket as ClientSocket } from 'socket.io-client';
import {
  BridgeCallEvent,
  type BridgeCallRequest,
  type BridgeCallResponse,
  BridgeCallResponseEvent,
  BridgeConnectedEvent,
  BridgeRefusedEvent,
} from './bridge-common';

// ws client, this is where the request is processed
export class BridgeClient {
  private socket: ClientSocket | null = null;
  constructor(
    public endpoint: string,
    public onBridgeCall: (method: string, args: any[]) => Promise<any>,
  ) {}

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = ClientIO(this.endpoint);

      this.socket.on(BridgeConnectedEvent, () => {
        console.log('bridge-connected');
        resolve(this.socket);
      });
      this.socket.on(BridgeRefusedEvent, (e: any) => {
        console.error('bridge-refused', e);
        reject(new Error(e || 'bridge refused'));
      });
      this.socket.on(BridgeCallEvent, (call: BridgeCallRequest) => {
        const id = call.id;
        assert(typeof id !== 'undefined', 'call id is required');
        Promise.resolve().then(async () => {
          let response: any;
          try {
            response = await this.onBridgeCall(call.method, call.args);
          } catch (e) {
            return this.socket?.emit(BridgeCallResponseEvent, {
              id,
              error: e,
            } as BridgeCallResponse);
          }
          this.socket?.emit(BridgeCallResponseEvent, {
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
