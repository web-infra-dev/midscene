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

  async runAdbCommand(command: string): Promise<string> {
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

  const device = new AndroidDevice(deviceId, {
    autoDismissKeyboard: opts?.autoDismissKeyboard,
    androidAdbPath: opts?.androidAdbPath,
    remoteAdbHost: opts?.remoteAdbHost,
    remoteAdbPort: opts?.remoteAdbPort,
    imeStrategy: opts?.imeStrategy,
    displayId: opts?.displayId,
    usePhysicalDisplayIdForScreenshot: opts?.usePhysicalDisplayIdForScreenshot,
    usePhysicalDisplayIdForDisplayLookup:
      opts?.usePhysicalDisplayIdForDisplayLookup,
  });

  await device.connect();

  return new AndroidAgent(device, opts);
}
