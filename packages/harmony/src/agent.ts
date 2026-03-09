import type { ActionParam, ActionReturn, DeviceAction } from '@midscene/core';
import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import { mergeAndNormalizeAppNameMapping } from '@midscene/shared/utils';
import { defaultAppNameMapping } from './appNameMapping';
import {
  type DeviceActionHarmonyBackButton,
  type DeviceActionHarmonyHomeButton,
  type DeviceActionHarmonyRecentAppsButton,
  type DeviceActionLaunch,
  type DeviceActionRunHdcShell,
  HarmonyDevice,
  type HarmonyDeviceOpt,
} from './device';
import { getConnectedDevices } from './utils';

const debugAgent = getDebug('harmony:agent');

export type HarmonyAgentOpt = AgentOpt & {
  /**
   * Custom mapping of app names to bundle names
   * User-provided mappings will take precedence over default mappings
   */
  appNameMapping?: Record<string, string>;
};

type ActionArgs<T extends DeviceAction> = [ActionParam<T>] extends [undefined]
  ? []
  : [ActionParam<T>];

type WrappedAction<T extends DeviceAction> = (
  ...args: ActionArgs<T>
) => Promise<ActionReturn<T>>;

export class HarmonyAgent extends PageAgent<HarmonyDevice> {
  back!: WrappedAction<DeviceActionHarmonyBackButton>;
  home!: WrappedAction<DeviceActionHarmonyHomeButton>;
  recentApps!: WrappedAction<DeviceActionHarmonyRecentAppsButton>;

  private appNameMapping: Record<string, string>;

  constructor(device: HarmonyDevice, opts?: HarmonyAgentOpt) {
    super(device, opts);
    this.appNameMapping = mergeAndNormalizeAppNameMapping(
      defaultAppNameMapping,
      opts?.appNameMapping,
    );

    device.setAppNameMapping(this.appNameMapping);

    this.back =
      this.createActionWrapper<DeviceActionHarmonyBackButton>(
        'HarmonyBackButton',
      );
    this.home =
      this.createActionWrapper<DeviceActionHarmonyHomeButton>(
        'HarmonyHomeButton',
      );
    this.recentApps =
      this.createActionWrapper<DeviceActionHarmonyRecentAppsButton>(
        'HarmonyRecentAppsButton',
      );
  }

  async launch(uri: string): Promise<void> {
    const action = this.wrapActionInActionSpace<DeviceActionLaunch>('Launch');
    return action({ uri });
  }

  async runHdcShell(command: string): Promise<string> {
    const action =
      this.wrapActionInActionSpace<DeviceActionRunHdcShell>('RunHdcShell');
    return action({ command });
  }

  private createActionWrapper<T extends DeviceAction>(
    name: string,
  ): WrappedAction<T> {
    const action = this.wrapActionInActionSpace<T>(name);
    return ((...args: ActionArgs<T>) =>
      action(args[0] as ActionParam<T>)) as WrappedAction<T>;
  }
}

export async function agentFromHdcDevice(
  deviceId?: string,
  opts?: HarmonyAgentOpt & HarmonyDeviceOpt,
) {
  if (!deviceId) {
    const devices = await getConnectedDevices(opts?.hdcPath);

    if (devices.length === 0) {
      throw new Error(
        'No HarmonyOS devices found. Please connect a HarmonyOS device and ensure HDC is properly configured. Run `hdc list targets` to verify device connection.',
      );
    }

    deviceId = devices[0].deviceId;

    debugAgent(
      'deviceId not specified, will use the first device (id = %s)',
      deviceId,
    );
  }

  const device = new HarmonyDevice(deviceId, opts || {});

  await device.connect();

  return new HarmonyAgent(device, opts);
}
