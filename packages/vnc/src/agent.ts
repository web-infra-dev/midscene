import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { VNCDevice, type VNCDeviceOpt } from './device';

export type VNCAgentOpt = AgentOpt & VNCDeviceOpt;

export class VNCAgent extends PageAgent<VNCDevice> {}

/**
 * Create an Agent connected to a remote VNC server
 */
export async function agentFromVNC(
  opts: VNCAgentOpt,
): Promise<VNCAgent> {
  const device = new VNCDevice(opts);
  await device.connect();
  return new VNCAgent(device, opts);
}
