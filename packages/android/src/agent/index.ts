import assert from 'node:assert';
import { PageAgent, type PageAgentOpt } from '@midscene/web';
import { AndroidDevice } from '../page';

export class AndroidAgent extends PageAgent<AndroidDevice> {
  async launch(uri: string): Promise<void> {
    const device = this.page;
    await device.launch(uri);
  }
}

export async function agentFromAdbDevice(
  deviceId: string,
  opts?: PageAgentOpt,
) {
  assert(deviceId, 'deviceId is required for AndroidDevice');

  const page = new AndroidDevice(deviceId);

  await page.connect();

  return new AndroidAgent(page, opts);
}
