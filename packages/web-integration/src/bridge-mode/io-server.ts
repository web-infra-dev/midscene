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
} from './common';

// ws server, this is where the request is sent
export class BridgeServer {
  private callId = 0;
  private io: Server | null = null;
  private socket: ServerSocket | null = null;
  private listeningTimeoutId: NodeJS.Timeout | null = null;
  private connectionTipTimer: NodeJS.Timeout | null = null;
  public calls: Record<string, BridgeCall> = {};

  private connectionLost = false;
  private connectionLostReason = '';

  constructor(
    public port: number,
    public onConnect?: () => void,
    public onDisconnect?: (reason: string) => void,
  ) {}

  async listen(timeout = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.listeningTimeoutId) {
        return reject(new Error('already listening'));
      }

      this.listeningTimeoutId = setTimeout(() => {
        reject(
          new Error(
            `no extension connected after ${timeout}ms (${BridgeErrorCodeNoClientConnected})`,
          ),
        );
      }, timeout);

      this.connectionTipTimer =
        timeout > 3000
          ? setTimeout(() => {
              console.log('waiting for bridge to connect...');
            }, 2000)
          : null;

      this.io = new Server(this.port, {
        maxHttpBufferSize: 100 * 1024 * 1024, // 100MB
      });
      this.io.on('connection', (socket) => {
        this.connectionLost = false;
        this.connectionLostReason = '';
        this.listeningTimeoutId && clearTimeout(this.listeningTimeoutId);
        this.listeningTimeoutId = null;
        this.connectionTipTimer && clearTimeout(this.connectionTipTimer);
        this.connectionTipTimer = null;
        if (this.socket) {
          console.log('server already connected, refusing new connection');
          socket.emit(BridgeRefusedEvent);
          reject(new Error('server already connected by another client'));
        }
        try {
          // console.log('one client connected');
          this.socket = socket;

          socket.on(BridgeCallResponseEvent, (params: BridgeCallResponse) => {
            const id = params.id;
            const response = params.response;
            const error = params.error;

            this.triggerCallResponseCallback(id, error, response);
          });

          socket.on('disconnect', (reason: string) => {
            this.connectionLost = true;
            this.connectionLostReason = reason;
            this.onDisconnect?.(reason);

            // flush all pending calls as error
            for (const id in this.calls) {
              const call = this.calls[id];

              if (!call.responseTime) {
                const errorMessage = this.connectionLostErrorMsg();
                this.triggerCallResponseCallback(
                  id,
                  new Error(errorMessage),
                  null,
                );
              }
            }
          });

          setTimeout(() => {
            this.onConnect?.();
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

  private connectionLostErrorMsg = () => {
    return `Connection lost, reason: ${this.connectionLostReason}`;
  };

  private async triggerCallResponseCallback(
    id: string | number,
    error: Error | null,
    response: any,
  ) {
    const call = this.calls[id];
    if (!call) {
      throw new Error(`call ${id} not found`);
    }
    call.error = error || undefined;
    call.response = response;
    call.responseTime = Date.now();

    call.callback(call.error, response);
  }

  private async emitCall(id: string) {
    const call = this.calls[id];
    if (!call) {
      throw new Error(`call ${id} not found`);
    }

    if (this.connectionLost) {
      const message = `Connection lost, reason: ${this.connectionLostReason}`;
      call.callback(new Error(message), null);
      return;
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
    this.listeningTimeoutId && clearTimeout(this.listeningTimeoutId);
    this.connectionTipTimer && clearTimeout(this.connectionTipTimer);
    this.io?.close();
    this.io = null;
  }
}
