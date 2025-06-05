import { PageAgent, type PageAgentOpt } from '@midscene/web/agent';
import { AndroidDevice } from '../page';

import { vlLocateMode } from '@midscene/shared/env';
import { getConnectedDevices } from '../utils';

import { type AndroidDeviceOpt, debugPage } from '../page';

type AndroidAgentOpt = PageAgentOpt & AndroidDeviceOpt;

export class AndroidAgent extends PageAgent<AndroidDevice> {
  constructor(page: AndroidDevice, opts?: AndroidAgentOpt) {
    super(page, opts);

    this.page.options = {
      autoDismissKeyboard:
        this.page.options?.autoDismissKeyboard ?? opts?.autoDismissKeyboard,
      androidAdbPath: this.page.options?.androidAdbPath ?? opts?.androidAdbPath,
      remoteAdbHost: this.page.options?.remoteAdbHost ?? opts?.remoteAdbHost,
      remoteAdbPort: this.page.options?.remoteAdbPort ?? opts?.remoteAdbPort,
    };

    if (!vlLocateMode()) {
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
  opts?: AndroidAgentOpt,
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
  });

  await page.connect();

  return new AndroidAgent(page, opts);
}
