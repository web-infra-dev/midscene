import {
  type AdbFeature,
  AdbServerClient,
  type AdbServerClient as AdbServerClientType,
} from '@yume-chan/adb';

type DeviceFeatures = {
  transportId: bigint;
  features: readonly AdbFeature[];
};

const patchedClients = new WeakSet<AdbServerClientType>();

function isMultiDeviceFeatureError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('more than one device/emulator');
}

async function resolveTransportId(
  client: AdbServerClientType,
  device: AdbServerClient.DeviceSelector,
): Promise<bigint | undefined> {
  if (device && 'transportId' in device) {
    return device.transportId;
  }

  if (device && 'serial' in device) {
    const devices = await client.getDevices();
    return devices.find((info) => info.serial === device.serial)?.transportId;
  }

  if (!device) {
    const devices = await client.getDevices();
    if (devices.length !== 1) {
      return undefined;
    }
    return devices[0]?.transportId;
  }

  return undefined;
}

async function getDeviceFeaturesByTransportId(
  client: AdbServerClientType,
  transportId: bigint,
): Promise<DeviceFeatures> {
  const connection = await client.createConnection(
    AdbServerClient.formatDeviceService({ transportId }, 'features'),
  );
  try {
    const featuresString = await connection.readString();
    const features = featuresString
      ? (featuresString.split(',') as AdbFeature[])
      : [];
    return { transportId, features };
  } finally {
    await connection.dispose();
  }
}

export function installAdbServerClientFeaturesFallback(
  client: AdbServerClientType,
): void {
  if (patchedClients.has(client)) {
    return;
  }

  const getDeviceFeatures = client.getDeviceFeatures.bind(client);
  client.getDeviceFeatures = async (device) => {
    try {
      return await getDeviceFeatures(device);
    } catch (error) {
      if (!isMultiDeviceFeatureError(error)) {
        throw error;
      }

      let transportId: bigint | undefined;
      try {
        transportId = await resolveTransportId(client, device);
      } catch {
        throw error;
      }

      if (transportId === undefined) {
        throw error;
      }

      return getDeviceFeaturesByTransportId(client, transportId);
    }
  };

  patchedClients.add(client);
}
