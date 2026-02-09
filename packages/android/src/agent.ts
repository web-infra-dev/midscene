import type { ActionParam, ActionReturn, DeviceAction } from '@midscene/core';
import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import { mergeAndNormalizeAppNameMapping } from '@midscene/shared/utils';
import { defaultAppNameMapping } from './appNameMapping';
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

export type AndroidAgentOpt = AgentOpt & {
  /**
   * Custom mapping of app names to package names
   * User-provided mappings will take precedence over default mappings
   */
  appNameMapping?: Record<string, string>;
};

type ActionArgs<T extends DeviceAction> = [ActionParam<T>] extends [undefined]
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

  /**
   * User-provided app name to package name mapping
   */
  private appNameMapping: Record<string, string>;

  constructor(device: AndroidDevice, opts?: AndroidAgentOpt) {
    super(device, opts);
    // Merge user-provided mapping with default mapping
    // Normalize keys to allow flexible matching (case-insensitive, ignore spaces/dashes/underscores)
    // User-provided mapping has higher priority
    this.appNameMapping = mergeAndNormalizeAppNameMapping(
      defaultAppNameMapping,
      opts?.appNameMapping,
    );

    // Set the mapping on the device instance
    device.setAppNameMapping(this.appNameMapping);

    this.back =
      this.createActionWrapper<DeviceActionAndroidBackButton>(
        'AndroidBackButton',
      );
    this.home =
      this.createActionWrapper<DeviceActionAndroidHomeButton>(
        'AndroidHomeButton',
      );
    this.recentApps =
      this.createActionWrapper<DeviceActionAndroidRecentAppsButton>(
        'AndroidRecentAppsButton',
      );
  }

  /**
   * Launch an Android app or URL
   * @param uri - App package name, URL, or app name to launch
   */
  async launch(uri: string): Promise<void> {
    const action = this.wrapActionInActionSpace<DeviceActionLaunch>('Launch');
    return action({ uri });
  }

  /**
   * Execute ADB shell command on Android device
   * @param command - ADB shell command to execute
   */
  async runAdbShell(command: string): Promise<string> {
    const action =
      this.wrapActionInActionSpace<DeviceActionRunAdbShell>('RunAdbShell');
    return action(command);
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

    if (devices.length === 0) {
      throw new Error(
        'No Android devices found. Please connect an Android device and ensure ADB is properly configured. Run `adb devices` to verify device connection.',
      );
    }

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
