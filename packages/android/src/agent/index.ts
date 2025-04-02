<<<<<<< HEAD
import { PageAgent, type PageAgentOpt } from '@midscene/web/agent';
=======
import assert from 'node:assert';
import { PageAgent, type PageAgentOpt } from '@midscene/web';
import type { WebPage } from '@midscene/web/.';
>>>>>>> 299ce4f (refactor: enhance Android agent to accept options for device connection)
import { AndroidDevice } from '../page';

import { vlLocateMode } from '@midscene/core/env';
import { getConnectedDevices } from '../utils';

export class AndroidAgent extends PageAgent<AndroidDevice> {
  constructor(page: AndroidDevice, opts?: PageAgentOpt) {
    super(page, opts);

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
<<<<<<< HEAD
  deviceId?: string,
  opts?: PageAgentOpt,
) {
  if (!deviceId) {
    const devices = await getConnectedDevices();

    deviceId = devices[0].udid;
  }
=======
  deviceId: string,
  opts?: PageAgentOpt,
) {
  assert(deviceId, 'deviceId is required for AndroidDevice');
>>>>>>> 299ce4f (refactor: enhance Android agent to accept options for device connection)

  const page = new AndroidDevice(deviceId);

  await page.connect();

<<<<<<< HEAD
  return new AndroidAgent(page, opts);
=======
  return new AndroidAgent(page as unknown as WebPage, opts);
>>>>>>> 299ce4f (refactor: enhance Android agent to accept options for device connection)
}
