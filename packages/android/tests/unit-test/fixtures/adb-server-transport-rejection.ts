import { AdbServerClient } from '@yume-chan/adb';
import { createAdbServerTransport } from '../../../src/adb-server-transport';

async function main(): Promise<void> {
  const connector = {
    connect() {
      throw new Error('Unexpected ADB server connection');
    },
    addReverseTunnel() {
      throw new Error('Unexpected reverse tunnel creation');
    },
    removeReverseTunnel() {
      throw new Error('Unexpected reverse tunnel removal');
    },
    clearReverseTunnels() {
      throw new Error('Unexpected reverse tunnel cleanup');
    },
  } satisfies AdbServerClient.ServerConnector;

  const client = new AdbServerClient(connector);
  client.getDeviceFeatures = async () => ({ transportId: 1n, features: [] });
  client.getDevices = async () => [
    {
      serial: 'device',
      state: 'device',
      authenticating: false,
      transportId: 1n,
    },
  ];

  let rejectDisconnect = (_reason: Error): void => {
    throw new Error('Disconnect monitor was not initialized');
  };
  client.waitForDisconnect = async () => {
    return new Promise((_, reject) => {
      rejectDisconnect = reject;
    });
  };

  const transport = await createAdbServerTransport(client, 'device');
  const disconnected = transport.disconnected.catch((error: unknown) => {
    if (!(error instanceof Error) || error.message !== 'ExactReadable ended') {
      throw error;
    }
  });

  rejectDisconnect(new Error('ExactReadable ended'));
  await disconnected;
  await new Promise<void>((resolve) => setImmediate(resolve));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
