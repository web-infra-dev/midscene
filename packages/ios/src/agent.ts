import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import { type IOSActionMap, IOSDevice, type IOSDeviceOpt } from './device';
import { checkIOSEnvironment } from './utils';

const debugAgent = getDebug('ios:agent');

type IOSAgentOpt = AgentOpt;

/**
 * Helper type to extract parameter field from action param object
 * For actions with single parameter fields like { uri: string }
 */
type ExtractSingleParam<T> = T extends { uri: infer U } ? U : T;

export class IOSAgent extends PageAgent<IOSDevice> {
  /**
   * Launch an iOS app or URL
   * Type-safe wrapper around the Launch action from actionSpace
   */
  async launch(
    uri: ExtractSingleParam<IOSActionMap['Launch']['param']>,
  ): Promise<IOSActionMap['Launch']['return']> {
    await this.callActionInActionSpace('Launch', { uri });
  }

  /**
   * Execute WebDriverAgent API request directly
   * Type-safe wrapper around the RunWdaRequest action from actionSpace
   */
  async runWdaRequest<TResult = any>(
    method: IOSActionMap['RunWdaRequest']['param']['method'],
    endpoint: IOSActionMap['RunWdaRequest']['param']['endpoint'],
    data?: IOSActionMap['RunWdaRequest']['param']['data'],
  ): Promise<TResult> {
    return await this.callActionInActionSpace('RunWdaRequest', {
      method,
      endpoint,
      data,
    });
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
