import { ScrcpyServer } from '@midscene/android-playground';

type ListedDevice = {
  id: string;
  name: string;
  status: string;
};

type ParentMessage =
  | { type: 'start'; port: number; deviceId?: string | null }
  | { type: 'set-device'; deviceId: string }
  | { type: 'devices-update'; devices: ListedDevice[] }
  | { type: 'stop' };

type ParentPort = {
  on(
    event: 'message',
    listener: (event: { data: ParentMessage }) => void,
  ): void;
  postMessage(message: unknown): void;
};

const parentPort = (process as typeof process & { parentPort?: ParentPort })
  .parentPort;
if (!parentPort) throw new Error('scrcpy worker requires an Electron parent');

let devices: ListedDevice[] = [];
const listeners = new Set<(nextDevices: ListedDevice[]) => void>();
const scrcpyServer = new ScrcpyServer({
  deviceListSource: {
    getDevices: async () => devices,
    subscribe(listener: (nextDevices: ListedDevice[]) => void) {
      listeners.add(listener);
      listener(devices);
      return () => listeners.delete(listener);
    },
  },
});

let messageQueue = Promise.resolve();
parentPort.on('message', (event) => {
  messageQueue = messageQueue
    .then(async () => {
      const message = event.data;
      if (message.type === 'devices-update') {
        devices = message.devices;
        for (const listener of listeners) listener(devices);
        return;
      }
      if (message.type === 'set-device') {
        scrcpyServer.currentDeviceId = message.deviceId;
        return;
      }
      if (message.type === 'start') {
        scrcpyServer.currentDeviceId = message.deviceId || null;
        await scrcpyServer.launch(message.port);
        parentPort.postMessage({ type: 'ready', port: message.port });
        return;
      }
      if (message.type === 'stop') {
        scrcpyServer.close();
        process.exit(0);
      }
    })
    .catch((error) => {
      parentPort.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    });
});
