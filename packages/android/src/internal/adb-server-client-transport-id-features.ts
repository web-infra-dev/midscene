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

async function resolveDeterministicTransportId(
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

/**
 * @internal Prefer transport-id qualified feature requests for deterministic
 * selectors before yume-chan/adb includes this behavior.
 */
export function installAdbServerClientTransportIdFeatures(
  client: AdbServerClientType,
): void {
  if (patchedClients.has(client)) {
    return;
  }

  const getDeviceFeatures = client.getDeviceFeatures.bind(client);
  client.getDeviceFeatures = async (device) => {
    let transportId: bigint | undefined;
    try {
      transportId = await resolveDeterministicTransportId(client, device);
    } catch {
      return getDeviceFeatures(device);
    }

    if (transportId !== undefined) {
      return getDeviceFeaturesByTransportId(client, transportId);
    }

    return getDeviceFeatures(device);
  };

  patchedClients.add(client);
}
