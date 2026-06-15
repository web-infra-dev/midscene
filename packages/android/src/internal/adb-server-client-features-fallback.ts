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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMultiDeviceFeatureError(error: unknown): boolean {
  return getErrorMessage(error).includes('more than one device/emulator');
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

/**
 * @internal Work around ADB server feature requests that ignore serial selectors
 * before yume-chan/adb includes a transport-id qualified features request.
 */
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
      } catch (resolveError) {
        throw new Error(
          `Failed to resolve transport ID for ADB features fallback after "${getErrorMessage(error)}": ${getErrorMessage(resolveError)}`,
          { cause: resolveError },
        );
      }

      if (transportId === undefined) {
        throw error;
      }

      return getDeviceFeaturesByTransportId(client, transportId);
    }
  };

  patchedClients.add(client);
}
