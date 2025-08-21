import { PageAgent, type PageAgentOpt } from '@midscene/web/agent';
import { AndroidDevice, type AndroidDeviceOpt } from '../page';

import { vlLocateMode } from '@midscene/shared/env';
import { getConnectedDevices } from '../utils';

import { debugPage } from '../page';

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

    debugPage(
      'deviceId not specified, will use the first device (id = %s)',
      deviceId,
    );
  }

  const page = new AndroidDevice(deviceId, {
    autoDismissKeyboard: opts?.autoDismissKeyboard,
    androidAdbPath: opts?.androidAdbPath,
    remoteAdbHost: opts?.remoteAdbHost,
    remoteAdbPort: opts?.remoteAdbPort,
    imeStrategy: opts?.imeStrategy,
    activeDisplayId: opts?.activeDisplayId,
  });

  await page.connect();

  return new AndroidAgent(page, opts);
}
