import type { ActionParam, ActionReturn, DeviceAction } from '@midscene/core';
import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { MIDSCENE_IOS_DEVICE_CLASS_OVERRIDE } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { mergeAndNormalizeAppNameMapping } from '@midscene/shared/utils';
import { defaultAppNameMapping } from './appNameMapping';
import {
  type DeviceActionIOSAppSwitcher,
  type DeviceActionIOSHomeButton,
  type DeviceActionLaunch,
  type DeviceActionRunWdaRequest,
  type DeviceActionTerminate,
  IOSDevice,
  type IOSDeviceOpt,
} from './device';

const debugAgent = getDebug('ios:agent');
type IOSDeviceClass = new (opts?: IOSDeviceOpt) => IOSDevice;

export type IOSAgentOpt = AgentOpt & {
  /**
   * Custom mapping of app names to bundle IDs
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

export class IOSAgent extends PageAgent<IOSDevice> {
  /**
   * Execute WebDriverAgent API request directly
   * Type-safe wrapper around the RunWdaRequest action from actionSpace
   */
  runWdaRequest!: WrappedAction<DeviceActionRunWdaRequest>;

  /**
   * Trigger the system home operation on iOS devices
   */
  home!: WrappedAction<DeviceActionIOSHomeButton>;

  /**
   * Trigger the system app switcher operation on iOS devices
   */
  appSwitcher!: WrappedAction<DeviceActionIOSAppSwitcher>;

  /**
   * User-provided app name to bundle ID mapping
   */
  private appNameMapping: Record<string, string>;

  constructor(device: IOSDevice, opts?: IOSAgentOpt) {
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

    this.runWdaRequest =
      this.createActionWrapper<DeviceActionRunWdaRequest>('RunWdaRequest');
    this.home =
      this.createActionWrapper<DeviceActionIOSHomeButton>('IOSHomeButton');
    this.appSwitcher =
      this.createActionWrapper<DeviceActionIOSAppSwitcher>('IOSAppSwitcher');
  }

  /**
   * Launch an iOS app or URL
   * @param uri - App name, bundle ID, or URL to launch
   */
  async launch(uri: string): Promise<void> {
    const action = this.wrapActionInActionSpace<DeviceActionLaunch>('Launch');
    return action({ uri });
  }

  /**
   * Terminate (close) an iOS app by bundle ID
   * @param uri - Bundle ID of the app to terminate
   */
  async terminate(uri: string): Promise<void> {
    const action =
      this.wrapActionInActionSpace<DeviceActionTerminate>('Terminate');
    return action({ uri });
  }

  private createActionWrapper<T extends DeviceAction>(
    name: string,
  ): WrappedAction<T> {
    const action = this.wrapActionInActionSpace<T>(name);
    return ((...args: ActionArgs<T>) =>
      action(args[0] as ActionParam<T>)) as WrappedAction<T>;
  }
}

export async function agentFromWebDriverAgent(
  opts?: IOSAgentOpt & IOSDeviceOpt,
) {
  debugAgent('Creating iOS agent with WebDriverAgent');

  const overrideModule =
    opts?.iOSDeviceClassOverride?.trim() ||
    opts?.iosDeviceClassOverride?.trim() ||
    process.env[MIDSCENE_IOS_DEVICE_CLASS_OVERRIDE]?.trim();

  let DeviceClass: IOSDeviceClass = IOSDevice;

  if (overrideModule) {
    try {
      const overrideExports = await import(overrideModule);
      const overrideDeviceClass = Object.prototype.hasOwnProperty.call(
        overrideExports,
        'IOSDevice',
      )
        ? overrideExports.IOSDevice
        : overrideExports.default;

      if (typeof overrideDeviceClass !== 'function') {
        throw new Error(
          `Module "${overrideModule}" does not export a valid iOS device class (expected "IOSDevice" or default export).`,
        );
      }

      DeviceClass = overrideDeviceClass as IOSDeviceClass;
    } catch (error) {
      throw new Error(
        `Failed to load iOS device class override from "${overrideModule}". Please make sure the package is installed and exports IOSDevice (or default) with Midscene-compatible methods. Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Pass all device options to device constructor, ensuring we pass an empty object if opts is undefined
  const device = new DeviceClass(opts || {});

  await device.connect();

  return new IOSAgent(device, opts);
}
