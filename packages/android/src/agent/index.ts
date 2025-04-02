import { PageAgent, type PageAgentOpt } from '@midscene/web/agent';
import { AndroidDevice } from '../page';
import { getConnectedDevices } from '../utils';

export class AndroidAgent extends PageAgent<AndroidDevice> {
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
