import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { RDPDevice, type RDPDeviceOpt } from './device';

export type RDPAgentOpt = AgentOpt & RDPDeviceOpt;

export class RDPAgent extends PageAgent<RDPDevice> {}

export async function agentFromRdp(opts: RDPAgentOpt): Promise<RDPAgent> {
  const device = new RDPDevice(opts);
  await device.connect();
  return new RDPAgent(device, opts);
}
