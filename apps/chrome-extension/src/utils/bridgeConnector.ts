import { ExtensionBridgePageBrowserSide } from '@midscene/web/bridge-mode-browser';

export type BridgeStatus =
  | 'listening'
  | 'connected'
  | 'disconnected'
  | 'closed';

export class BridgeConnector {
  private activeBridgePage: ExtensionBridgePageBrowserSide | null = null;
  private status: BridgeStatus = 'closed';
  private connectRetryInterval = 3000; // Retry every 3 seconds

  constructor(
    private onMessage: (
      message: string,
      type: 'log' | 'status',
    ) => void = () => {},
    private onStatusChange: (status: BridgeStatus) => void = () => {},
    private serverEndpoint?: string,
    private onConnectionRequest?: () => Promise<boolean>,
  ) {}

  getServerEndpoint(): string | undefined {
    return this.serverEndpoint;
  }

  private setStatus(status: BridgeStatus) {
    if (this.status === status) {
      return; // No change, skip notification
    }
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
        let wasConnected = false;
        try {
          activeBridgePage = new ExtensionBridgePageBrowserSide(
            this.serverEndpoint,
            () => {
              // Only set to disconnected if we were actually connected before
              if (this.status === 'connected' || wasConnected) {
                this.setStatus('disconnected');
                this.activeBridgePage = null;
              }
            },
            this.onMessage,
            true, // forceSameTabNavigation
            this.onConnectionRequest,
          );

          await activeBridgePage.connect();
          this.activeBridgePage = activeBridgePage;
          wasConnected = true;
          this.setStatus('connected');
        } catch (e: any) {
          // Don't call destroy() if we were never connected - just clean up
          if (wasConnected) {
            activeBridgePage?.destroy();
          }
          this.activeBridgePage = null;

          // If user denied the connection, continue listening for next connection
          if (e?.message === 'Connection denied by user') {
            console.log(
              'Connection denied by user, continuing to listen for next connection',
            );
          } else {
            console.warn('failed to setup connection', e);
          }

          // Keep listening status while retrying
          if (this.status !== 'closed') {
            this.setStatus('listening');
          }

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
