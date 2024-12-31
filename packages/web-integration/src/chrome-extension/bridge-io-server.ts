import { Server, type Socket as ServerSocket } from 'socket.io';
import {
  type BridgeCall,
  BridgeCallEvent,
  type BridgeCallResponse,
  BridgeCallResponseEvent,
  BridgeCallTimeout,
  BridgeConnectedEvent,
  BridgeErrorCodeNoClientConnected,
  BridgeRefusedEvent,
} from './bridge-common';

// ws server, this is where the request is sent
export class BridgeServer {
  private callId = 0;
  private io: Server | null = null;
  private socket: ServerSocket | null = null;
  public calls: Record<string, BridgeCall> = {};

  constructor(public port: number) {}

  async listen(timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutListener = setTimeout(() => {
        reject(
          new Error(
            `no client connected after ${timeout}ms (${BridgeErrorCodeNoClientConnected})`,
          ),
        );
      }, timeout);

      this.io = new Server(this.port);
      this.io.on('connection', (socket) => {
        clearTimeout(timeoutListener);

        if (this.socket) {
          console.log('server already connected, refusing new connection');
          socket.emit(BridgeRefusedEvent);
          reject(new Error('server already connected by another client'));
        }
        try {
          console.log('one client connected');
          this.socket = socket;

          socket.on(BridgeCallResponseEvent, (params: BridgeCallResponse) => {
            const id = params.id;
            const response = params.response;
            const call = this.calls[id];
            if (!call) {
              throw new Error(`call ${id} not found`);
            }
            call.error = params.error;
            call.response = response;
            call.responseTime = Date.now();

            console.log('callback', call.method, call.error, response);
            call.callback(call.error, response);
          });

          setTimeout(() => {
            socket.emit(BridgeConnectedEvent);
            Promise.resolve().then(() => {
              for (const id in this.calls) {
                if (this.calls[id].callTime === 0) {
                  this.emitCall(id);
                }
              }
            });
          }, 0);

          resolve();
        } catch (e) {
          console.error('failed to handle connection event', e);
          reject(e);
        }
      });
    });
  }

  private async emitCall(id: string) {
    const call = this.calls[id];
    if (!call) {
      throw new Error(`call ${id} not found`);
    }

    if (this.socket) {
      this.socket.emit(BridgeCallEvent, {
        id,
        method: call.method,
        args: call.args,
      });
      call.callTime = Date.now();
    }
  }

  async call<T = any>(
    method: string,
    args: any[],
    timeout = BridgeCallTimeout,
  ): Promise<T> {
    const id = `${this.callId++}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.log(
          `bridge call timeout, id=${id}, method=${method}, args=`,
          args,
        );
        this.calls[id].error = new Error(
          `Bridge call timeout after ${timeout}ms: ${method}`,
        );
        reject(this.calls[id].error);
      }, timeout);

      this.calls[id] = {
        method,
        args,
        response: null,
        callTime: 0,
        responseTime: 0,
        callback: (error: Error | undefined, response: any) => {
          clearTimeout(timeoutId);
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        },
      };

      this.emitCall(id);
    });
  }

  close() {
    this.io?.close();
    this.io = null;
  }
}
