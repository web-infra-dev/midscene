import { ExtensionBridgePageBrowserSide } from '@midscene/web/bridge-mode-browser';

export type BridgeStatus =
  | 'listening'
  | 'connected'
  | 'disconnected'
  | 'closed';

export class BridgeConnector {
  private activeBridgePage: ExtensionBridgePageBrowserSide | null = null;
  private status: BridgeStatus = 'closed';
  private connectRetryInterval = 300;

  constructor(
    private onMessage: (
      message: string,
      type: 'log' | 'status',
    ) => void = () => {},
    private onStatusChange: (status: BridgeStatus) => void = () => {},
    private serverEndpoint?: string,
  ) {}

  private setStatus(status: BridgeStatus) {
    this.status = status;
    this.onStatusChange(status);
  }

  async connect(): Promise<void> {
    if (this.status === 'listening' || this.status === 'connected') {
      return;
    }

    this.setStatus('listening');

    const connectLoop = async () => {
      while (true) {
        if (this.status === 'connected') {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        if (this.status === 'closed') {
          break;
        }

        if (this.status !== 'listening' && this.status !== 'disconnected') {
          throw new Error(`unexpected status: ${this.status}`);
        }

        let activeBridgePage: ExtensionBridgePageBrowserSide | null = null;
        try {
          activeBridgePage = new ExtensionBridgePageBrowserSide(
            this.serverEndpoint,
            () => {
              if (this.status !== 'closed') {
                this.setStatus('disconnected');
                this.activeBridgePage = null;
              }
            },
            this.onMessage,
          );

          await activeBridgePage.connect();
          this.activeBridgePage = activeBridgePage;
          this.setStatus('connected');
        } catch (e) {
          this.activeBridgePage?.destroy();
          this.activeBridgePage = null;
          console.warn('failed to setup connection', e);
          await new Promise((resolve) =>
            setTimeout(resolve, this.connectRetryInterval),
          );
        }
      }
    };

    connectLoop();
  }

  async disconnect(): Promise<void> {
    if (this.status === 'closed') {
      console.warn('Cannot stop connection if not connected');
      return;
    }

    if (this.activeBridgePage) {
      await this.activeBridgePage.destroy();
      this.activeBridgePage = null;
    }

    this.setStatus('closed');
  }

  getStatus(): BridgeStatus {
    return this.status;
  }
}
