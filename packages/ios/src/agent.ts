import type { ActionParam, ActionReturn, DeviceAction } from '@midscene/core';
import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import {
  type DeviceActionLaunch,
  type DeviceActionRunWdaRequest,
  IOSDevice,
  type IOSDeviceOpt,
} from './device';
import { checkIOSEnvironment } from './utils';

const debugAgent = getDebug('ios:agent');

type IOSAgentOpt = AgentOpt;

/**
 * Helper type to convert DeviceAction to wrapped method signature
 */
type WrappedAction<T extends DeviceAction> = (
  param: ActionParam<T>,
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

  constructor(device: IOSDevice, opts?: IOSAgentOpt) {
    super(device, opts);
    this.launch = this.wrapActionInActionSpace<DeviceActionLaunch>('Launch');
    this.runWdaRequest =
      this.wrapActionInActionSpace<DeviceActionRunWdaRequest>('RunWdaRequest');
  }
}

export async function agentFromWebDriverAgent(
  opts?: IOSAgentOpt & IOSDeviceOpt,
) {
  debugAgent('Creating iOS agent with WebDriverAgent auto-detection');

  // Check iOS environment first
  const envCheck = await checkIOSEnvironment();
  if (!envCheck.available) {
    throw new Error(`iOS environment not available: ${envCheck.error}`);
  }

  // Pass all device options to IOSDevice constructor, ensuring we pass an empty object if opts is undefined
  const device = new IOSDevice(opts || {});

  await device.connect();

  return new IOSAgent(device, opts);
}
