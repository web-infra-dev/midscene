import type { ActionParam, ActionReturn, DeviceAction } from '@midscene/core';
import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import {
  AndroidDevice,
  type AndroidDeviceOpt,
  type DeviceActionAndroidBackButton,
  type DeviceActionAndroidHomeButton,
  type DeviceActionAndroidRecentAppsButton,
  type DeviceActionLaunch,
  type DeviceActionRunAdbShell,
} from './device';
import { getConnectedDevices } from './utils';

const debugAgent = getDebug('android:agent');

type AndroidAgentOpt = AgentOpt;

type ActionArgs<T extends DeviceAction> = [ActionParam<T>] extends [void]
  ? []
  : [ActionParam<T>];

/**
 * Helper type to convert DeviceAction to wrapped method signature
 */
type WrappedAction<T extends DeviceAction> = (
  ...args: ActionArgs<T>
) => Promise<ActionReturn<T>>;

export class AndroidAgent extends PageAgent<AndroidDevice> {
  /**
   * Launch an Android app or URL
   */
  launch!: WrappedAction<DeviceActionLaunch>;

  /**
   * Execute ADB shell command on Android device
   */
  runAdbShell!: WrappedAction<DeviceActionRunAdbShell>;

  /**
   * Trigger the system back operation on Android devices
   */
  back!: WrappedAction<DeviceActionAndroidBackButton>;

  /**
   * Trigger the system home operation on Android devices
   */
  home!: WrappedAction<DeviceActionAndroidHomeButton>;

  /**
   * Trigger the system recent apps operation on Android devices
   */
  recentApps!: WrappedAction<DeviceActionAndroidRecentAppsButton>;

  constructor(device: AndroidDevice, opts?: AndroidAgentOpt) {
    super(device, opts);
    this.launch = this.createActionWrapper<DeviceActionLaunch>('Launch');
    this.runAdbShell =
      this.createActionWrapper<DeviceActionRunAdbShell>('RunAdbShell');
    this.back = this.createActionWrapper<DeviceActionAndroidBackButton>(
      'AndroidBackButton',
    );
    this.home = this.createActionWrapper<DeviceActionAndroidHomeButton>(
      'AndroidHomeButton',
    );
    this.recentApps =
      this.createActionWrapper<DeviceActionAndroidRecentAppsButton>(
        'AndroidRecentAppsButton',
      );
  }

  private createActionWrapper<T extends DeviceAction>(
    name: string,
  ): WrappedAction<T> {
    const action = this.wrapActionInActionSpace<T>(name);
    return ((...args: ActionArgs<T>) =>
      action(args[0] as ActionParam<T>)) as WrappedAction<T>;
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
