import { PageAgent, type PageAgentOpt } from '@midscene/web/agent';
import { AndroidDevice } from '../page';

import { vlLocateMode } from '@midscene/core/env';
import { getConnectedDevices } from '../utils';

export class AndroidAgent extends PageAgent<AndroidDevice> {
  constructor(page: AndroidDevice, opts?: PageAgentOpt) {
    super(page, opts);

    if (vlLocateMode() === false) {
      throw new Error('Android Agent only supports vl-model mode');
    }
  }

  async launch(uri: string): Promise<void> {
    const device = this.page;
    await device.launch(uri);
  }
}

export async function agentFromAdbDevice(
  deviceId?: string,
  opts?: PageAgentOpt,
) {
  if (!deviceId) {
    const devices = await getConnectedDevices();

    deviceId = devices[0].udid;
  }

  const page = new AndroidDevice(deviceId);

  await page.connect();

  return new AndroidAgent(page, opts);
}
