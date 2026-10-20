import path from 'node:path';
import { PlatformSidecarProcess } from './platform-sidecar-process';

type ScrcpyListedDevice = { id: string; name: string; status: string };
type ScrcpyStartMessage = {
  type: 'start';
  port: number;
  deviceId: string | null;
};
type ScrcpyWorkerMessage =
  | { type: 'ready'; port: number }
  | { type: 'error'; message: string };
type ScrcpyCommandMessage =
  | { type: 'set-device'; deviceId: string }
  | { type: 'devices-update'; devices: ScrcpyListedDevice[] }
  | { type: 'stop' };

export interface StudioScrcpyDeviceListSource {
  getDevices(): Promise<ScrcpyListedDevice[]>;
  subscribe(listener: (devices: ScrcpyListedDevice[]) => void): () => void;
}

export class StudioScrcpySidecarProcess {
  private readonly sidecar: PlatformSidecarProcess<
    ScrcpyStartMessage,
    ScrcpyWorkerMessage,
    ScrcpyCommandMessage
  >;
  private deviceId: string | null = null;
  private latestDevices: ScrcpyListedDevice[] = [];
  private unsubscribeDevices?: () => void;

  constructor(private readonly deviceListSource: StudioScrcpyDeviceListSource) {
    this.sidecar = new PlatformSidecarProcess({
      serviceName: 'midscene-scrcpy',
      workerPath: path.join(__dirname, 'scrcpy-worker.cjs'),
      isReadyMessage: (message) => message.type === 'ready',
      getErrorMessage: (message) =>
        message.type === 'error' ? message.message : undefined,
      stopMessage: { type: 'stop' },
      onReady: () => {
        if (this.latestDevices.length > 0) {
          this.sidecar.postMessage({
            type: 'devices-update',
            devices: this.latestDevices,
          });
        }
      },
    });
  }

  get currentDeviceId(): string | null {
    return this.deviceId;
  }

  set currentDeviceId(deviceId: string | null) {
    this.deviceId = deviceId;
    if (deviceId) this.sidecar.postMessage({ type: 'set-device', deviceId });
  }

  async launch(port?: number): Promise<void> {
    if (!port) throw new Error('scrcpy sidecar port is required');
    await this.sidecar.start({ type: 'start', port, deviceId: this.deviceId });

    this.unsubscribeDevices?.();
    this.unsubscribeDevices = this.deviceListSource.subscribe((devices) => {
      this.latestDevices = devices;
      this.sidecar.postMessage({ type: 'devices-update', devices });
    });
    this.latestDevices = await this.deviceListSource.getDevices();
    this.sidecar.postMessage({
      type: 'devices-update',
      devices: this.latestDevices,
    });
  }

  async close(): Promise<void> {
    this.unsubscribeDevices?.();
    this.unsubscribeDevices = undefined;
    await this.sidecar.stop();
  }
}
