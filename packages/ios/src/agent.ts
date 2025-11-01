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

export class IOSAgent extends PageAgent<IOSDevice> {
  /**
   * Launch an iOS app or URL
   * Type-safe wrapper around the Launch action from actionSpace
   */
  launch = this.wrapActionInActionSpace<DeviceActionLaunch>('Launch');

  /**
   * Execute WebDriverAgent API request directly
   * Type-safe wrapper around the RunWdaRequest action from actionSpace
   */
  runWdaRequest =
    this.wrapActionInActionSpace<DeviceActionRunWdaRequest>('RunWdaRequest');
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
