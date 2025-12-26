import fs from 'fs';
import path from 'path';

import { agentFromAdbDevice, AndroidAgent } from '@midscene/android';
import { getMidsceneRunDir } from '@midscene/shared';

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

  public async ai(task: string): Promise<any> {
    if (!this.agent) {
      throw new Error('Android agent not setup');
    }
    return this.agent.ai(task);
  }

  public terminate(status: 'Successful' | 'Failed' | undefined): Promise<void> {
    if (!this.agent) {
      console.warn('Android agent not setup, nothing to terminate');
      return Promise.resolve();
    }

    let reportDir = path.resolve(process.cwd(), getMidsceneRunDir(), 'report');
    let reportName = this.agent.reportFileName;
    const reportPath = path.join(reportDir, `${reportName}.html`);

    if (fs.existsSync(reportPath)) {
      const targetStatus =
        status === 'Successful'
          ? 'Pass'
          : status === 'Failed'
            ? 'Fail'
            : 'Unknown';

      fs.renameSync(
        reportPath,
        path.join(reportDir, `${reportName}-${targetStatus}.html`),
      );
    }

    return this.agent?.destroy();
  }
}
