import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import { IOSDevice, type IOSDeviceOpt } from './device';
import { checkIOSEnvironment } from './utils';

const debugAgent = getDebug('ios:agent');

type IOSAgentOpt = AgentOpt;

export class IOSAgent extends PageAgent<IOSDevice> {
  async launch(uri: string): Promise<void> {
    const device = this.page;
    await device.launch(uri);
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

  const device = new IOSDevice({
    autoDismissKeyboard: opts?.autoDismissKeyboard,
    customActions: opts?.customActions,
    wdaPort: opts?.wdaPort,
    wdaHost: opts?.wdaHost,
    useWDA: opts?.useWDA,
  });

  await device.connect();

  return new IOSAgent(device, opts);
}
