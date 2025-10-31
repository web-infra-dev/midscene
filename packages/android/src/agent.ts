import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import {
  AndroidDevice,
  type AndroidDeviceOpt,
  type DeviceActionLaunch,
  type DeviceActionRunAdbShell,
} from './device';
import { getConnectedDevices } from './utils';

const debugAgent = getDebug('android:agent');

type AndroidAgentOpt = AgentOpt;

export class AndroidAgent extends PageAgent<AndroidDevice> {
  /**
   * Launch an Android app or URL
   */
  launch = this.wrapActionInActionSpace<DeviceActionLaunch>('Launch');

  /**
   * Execute ADB shell command on Android device
   */
  runAdbShell =
    this.wrapActionInActionSpace<DeviceActionRunAdbShell>('RunAdbShell');
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
