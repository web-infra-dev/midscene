import { PageAgent } from '@midscene/web';
import type { AndroidDevice } from '../page';

export class AndroidAgent extends PageAgent {
  async launch(uri: string): Promise<void> {
    const device = this.page as unknown as AndroidDevice;
    await device.launch(uri);
  }
}
