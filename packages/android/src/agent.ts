import { Agent as PageAgent, type PageAgentOpt } from '@midscene/core/agent';
import { vlLocateMode } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { AndroidDevice, type AndroidDeviceOpt } from './device';
import { getConnectedDevices } from './utils';

const debugAgent = getDebug('android:agent');

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
