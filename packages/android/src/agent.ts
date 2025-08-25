import { Agent as PageAgent, type PageAgentOpt } from '@midscene/core/agent';
import { vlLocateMode } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { ADB, type Device } from 'appium-adb';
import { AndroidDevice, type AndroidDeviceOpt } from './device';

const debugAgent = getDebug('android:agent');

export async function getConnectedDevices(): Promise<Device[]> {
  try {
    const adb = await ADB.createADB({
      adbExecTimeout: 60000,
    });
    const devices = await adb.getConnectedDevices();

    debugAgent(`Found ${devices.length} connected devices: `, devices);

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

type AndroidAgentOpt = PageAgentOpt;

export class AndroidAgent extends PageAgent<AndroidDevice> {
  declare page: AndroidDevice;

  constructor(page: AndroidDevice, opts?: AndroidAgentOpt) {
    super(page, opts);

    if (
      !vlLocateMode({ intent: 'grounding' }) ||
      !vlLocateMode({ intent: 'planning' })
    ) {
      throw new Error(
        'Android Agent only supports vl-model. https://midscenejs.com/choose-a-model.html',
      );
    }
  }

  async launch(uri: string): Promise<void> {
    const device = this.page;
    await device.launch(uri);
  }
}

export async function agentFromAdbDevice(
  deviceId?: string,
  opts?: AndroidAgentOpt & AndroidDeviceOpt,
) {
  if (!deviceId) {
    const devices = await getConnectedDevices();

    deviceId = devices[0].udid;

    debugAgent(
      'deviceId not specified, will use the first device (id = %s)',
      deviceId,
    );
  }

  const device = new AndroidDevice(deviceId, {
    autoDismissKeyboard: opts?.autoDismissKeyboard,
    androidAdbPath: opts?.androidAdbPath,
    remoteAdbHost: opts?.remoteAdbHost,
    remoteAdbPort: opts?.remoteAdbPort,
    imeStrategy: opts?.imeStrategy,
    displayId: opts?.displayId,
    usePhysicalDisplayIdForScreenshot: opts?.usePhysicalDisplayIdForScreenshot,
    usePhysicalDisplayIdForDisplayLookup:
      opts?.usePhysicalDisplayIdForDisplayLookup,
  });

  await device.connect();

  return new AndroidAgent(device, opts);
}
