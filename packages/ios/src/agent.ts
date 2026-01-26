import type { ActionParam, ActionReturn, DeviceAction } from '@midscene/core';
import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import { mergeAndNormalizeAppNameMapping } from '@midscene/shared/utils';
import { defaultAppNameMapping } from './appNameMapping';
import {
  type DeviceActionIOSAppSwitcher,
  type DeviceActionIOSHomeButton,
  type DeviceActionLaunch,
  type DeviceActionRunWdaRequest,
  IOSDevice,
  type IOSDeviceOpt,
} from './device';

const debugAgent = getDebug('ios:agent');

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
   * Launch an iOS app or URL
   * Type-safe wrapper around the Launch action from actionSpace
   */
  launch!: WrappedAction<DeviceActionLaunch>;

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

    this.launch = this.createActionWrapper<DeviceActionLaunch>('Launch');
    this.runWdaRequest =
      this.createActionWrapper<DeviceActionRunWdaRequest>('RunWdaRequest');
    this.home =
      this.createActionWrapper<DeviceActionIOSHomeButton>('IOSHomeButton');
    this.appSwitcher =
      this.createActionWrapper<DeviceActionIOSAppSwitcher>('IOSAppSwitcher');
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

  // Pass all device options to IOSDevice constructor, ensuring we pass an empty object if opts is undefined
  const device = new IOSDevice(opts || {});

  await device.connect();

  return new IOSAgent(device, opts);
}
