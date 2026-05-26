import { getDebug } from '@midscene/shared/logger';
import { ADB, type Device } from 'appium-adb';

const debugUtils = getDebug('android:utils');
const DETAIL_LOOKUP_ADB_TIMEOUT_MS = 8000;
const DETAIL_LOOKUP_STEP_TIMEOUT_MS = 2000;

export interface AndroidConnectedDevice extends Device {
  model?: string;
  brand?: string;
  resolution?: string;
  density?: number;
}

function cleanProp(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function parseResolution(stdout: string): string | undefined {
  const overrideSize = stdout.match(/Override size:\s*([^\r\n]+)/);
  if (overrideSize?.[1]) {
    return overrideSize[1].trim();
  }

  const physicalSize = stdout.match(/Physical size:\s*([^\r\n]+)/);
  if (physicalSize?.[1]) {
    return physicalSize[1].trim();
  }

  return undefined;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function createAdbForDetailLookup(): Promise<ADB> {
  return await ADB.createADB({
    adbExecTimeout: DETAIL_LOOKUP_ADB_TIMEOUT_MS,
  });
}

export async function getConnectedDevices(): Promise<Device[]> {
  try {
    const adb = await ADB.createADB({
      adbExecTimeout: 60000,
    });
    const devices = await adb.getConnectedDevices();

    debugUtils(`Found ${devices.length} connected devices: `, devices);

    return devices;
  } catch (error: any) {
    console.error('Failed to get device list:', error);
    throw new Error(
      `Unable to get connected Android device list, please check https://midscenejs.com/integrate-with-android.html#faq : ${error.message}`,
      {
        cause: error,
      },
    );
  }
}

export async function getConnectedDevicesWithDetails(): Promise<
  AndroidConnectedDevice[]
> {
  const devices = await getConnectedDevices();

  if (devices.length === 0) {
    return [];
  }

  return await Promise.all(
    devices.map(async (device) => {
      const detailedDevice: AndroidConnectedDevice = { ...device };

      try {
        const adb = await createAdbForDetailLookup();
        adb.setDeviceId(device.udid);

        const [modelResult, brandResult, sizeResult, densityResult] =
          await Promise.allSettled([
            withTimeout(
              adb.shell(['getprop', 'ro.product.model']),
              DETAIL_LOOKUP_STEP_TIMEOUT_MS,
              `Android model lookup for ${device.udid}`,
            ),
            withTimeout(
              adb.shell(['getprop', 'ro.product.brand']),
              DETAIL_LOOKUP_STEP_TIMEOUT_MS,
              `Android brand lookup for ${device.udid}`,
            ),
            withTimeout(
              adb.shell(['wm', 'size']),
              DETAIL_LOOKUP_STEP_TIMEOUT_MS,
              `Android resolution lookup for ${device.udid}`,
            ),
            withTimeout(
              adb.getScreenDensity(),
              DETAIL_LOOKUP_STEP_TIMEOUT_MS,
              `Android density lookup for ${device.udid}`,
            ),
          ]);

        if (modelResult.status === 'fulfilled') {
          detailedDevice.model = cleanProp(modelResult.value);
        }

        if (brandResult.status === 'fulfilled') {
          detailedDevice.brand = cleanProp(brandResult.value);
        }

        if (sizeResult.status === 'fulfilled') {
          detailedDevice.resolution = parseResolution(sizeResult.value);
        }

        if (
          densityResult.status === 'fulfilled' &&
          typeof densityResult.value === 'number'
        ) {
          detailedDevice.density = densityResult.value;
        }
      } catch (error) {
        debugUtils(`Failed to enrich Android device ${device.udid}:`, error);
      }

      return detailedDevice;
    }),
  );
}
