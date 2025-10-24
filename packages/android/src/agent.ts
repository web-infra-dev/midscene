import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import { AndroidDevice, type AndroidDeviceOpt } from './device';
import { getConnectedDevices } from './utils';

const debugAgent = getDebug('android:agent');

type AndroidAgentOpt = AgentOpt;

export class AndroidAgent extends PageAgent<AndroidDevice> {
  async launch(uri: string): Promise<void> {
    const device = this.page;
    await device.launch(uri);
  }

  async runAdbShell(command: string): Promise<string> {
    const adb = await this.page.getAdb();
    return await adb.shell(command);
  }
}

export async function agentFromAdbDevice(
  deviceId?: string,
  opts?: AndroidAgentOpt & AndroidDeviceOpt,
) {
  if (!deviceId) {
    const devices = await getConnectedDevices();

    deviceId = devices[0].udid;

    debugAgent(
      'deviceId not specified, will use the first device (id = %s)',
      deviceId,
    );
  }

  // Pass all device options to AndroidDevice constructor, ensuring we pass an empty object if opts is undefined
  const device = new AndroidDevice(deviceId, opts || {});

  await device.connect();

  return new AndroidAgent(device, opts);
}
