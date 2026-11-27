import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import { ScreenRelayDevice, type ScreenRelayDeviceOpt } from './device';

export type ScreenRelayAgentOpt = AgentOpt;

export type AgentForScreenRelayOpt = ScreenRelayDeviceOpt & ScreenRelayAgentOpt;

export class ScreenRelayAgent extends PageAgent<ScreenRelayDevice> {}

/**
 * Connect to a screen-relay desktop session and create a ScreenRelayAgent.
 */
export async function agentForScreenRelay(
  opts?: AgentForScreenRelayOpt,
): Promise<ScreenRelayAgent> {
  const device = new ScreenRelayDevice({
    url: opts?.url,
    token: opts?.token,
    timeoutMs: opts?.timeoutMs,
    customActions: opts?.customActions,
  });
  await device.connect();
  return new ScreenRelayAgent(device, opts);
}
