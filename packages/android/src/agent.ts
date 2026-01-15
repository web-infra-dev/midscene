import type { ActionParam, ActionReturn, DeviceAction } from '@midscene/core';
import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';

import {
  FileStorage,
  defaultFilePathResolver,
} from '@midscene/core/storage/file';
import { getDebug } from '@midscene/shared/logger';
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

  /**
   * User-provided app name to package name mapping
   */
  private appNameMapping: Record<string, string>;

  constructor(device: AndroidDevice, opts?: AndroidAgentOpt) {
    // Use FileStorage and defaultFilePathResolver for Node.js environment
    const storageProvider = opts?.storageProvider ?? new FileStorage();
    const filePathResolver = opts?.filePathResolver ?? defaultFilePathResolver;
    super(device, { ...opts, storageProvider, filePathResolver });

    // Merge user-provided mapping with default mapping
    // User-provided mapping has higher priority
    this.appNameMapping = {
      ...defaultAppNameMapping,
      ...(opts?.appNameMapping || {}),
    };

    // Set the mapping on the device instance
    device.setAppNameMapping(this.appNameMapping);
    this.launch = this.createActionWrapper<DeviceActionLaunch>('Launch');
    this.runAdbShell =
      this.createActionWrapper<DeviceActionRunAdbShell>('RunAdbShell');
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
