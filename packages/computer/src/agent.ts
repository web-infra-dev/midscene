import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { ComputerDevice, type ComputerDeviceOpt } from './device';

export type ComputerAgentOpt = AgentOpt & ComputerDeviceOpt;

export class ComputerAgent extends PageAgent<ComputerDevice> {}

/**
 * Create an Agent from computer
 */
export async function agentFromComputer(
  opts?: ComputerAgentOpt,
): Promise<ComputerAgent> {
  const device = new ComputerDevice(opts || {});
  await device.connect();
  return new ComputerAgent(device, opts);
}
