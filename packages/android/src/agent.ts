import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import {
  type AndroidActionMap,
  AndroidDevice,
  type AndroidDeviceOpt,
} from './device';
import { getConnectedDevices } from './utils';

const debugAgent = getDebug('android:agent');

type AndroidAgentOpt = AgentOpt;

/**
 * Helper type to extract parameter field from action param object
 * For actions with single parameter fields like { uri: string } or { command: string }
 */
type ExtractSingleParam<T> = T extends { uri: infer U }
  ? U
  : T extends { command: infer C }
    ? C
    : T;

export class AndroidAgent extends PageAgent<AndroidDevice> {
  /**
   * Launch an Android app or URL
   * Type-safe wrapper around the Launch action from actionSpace
   */
  async launch(
    uri: ExtractSingleParam<AndroidActionMap['Launch']['param']>,
  ): Promise<AndroidActionMap['Launch']['return']> {
    await this.callActionInActionSpace('Launch', { uri });
  }

  /**
   * Execute ADB shell command on Android device
   * Type-safe wrapper around the RunAdbShell action from actionSpace
   */
  async runAdbShell(
    command: ExtractSingleParam<AndroidActionMap['RunAdbShell']['param']>,
  ): Promise<AndroidActionMap['RunAdbShell']['return']> {
    return await this.callActionInActionSpace('RunAdbShell', { command });
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
