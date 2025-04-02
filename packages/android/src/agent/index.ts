import assert from 'node:assert';
import { PageAgent } from '@midscene/web';
import type { WebPage } from '@midscene/web/.';
import { AndroidDevice } from '../page';

export class AndroidAgent extends PageAgent {
  async launch(uri: string): Promise<void> {
    const device = this.page as unknown as AndroidDevice;
    await device.launch(uri);
  }
}

export async function agentFromAdbDevice(deviceId: string) {
  assert(deviceId, 'deviceId is required for AndroidDevice');

  const page = new AndroidDevice(deviceId);

  await page.connect();

  return new AndroidAgent(page as unknown as WebPage);
}
