import { agentFromAdbDevice, AndroidAgent } from '@midscene/android';

import { IRPCService } from '../../types';

export class AndroidRPCService implements IRPCService {
  private agent: AndroidAgent | undefined;

  constructor(private deviceId: string) {}

  public async setup(fileName?: string) {
    this.agent = await agentFromAdbDevice(this.deviceId);

    if (fileName) {
      this.agent.reportFileName = fileName;
    }
  }

  public async ai(goal: string): Promise<string> {
    if (!this.agent) {
      throw new Error('Android agent not setup');
    }
    const result = await this.agent.ai(goal);

    return JSON.stringify(result);
  }
}
