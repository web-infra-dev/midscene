import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import type { AbstractInterface } from '@midscene/core/device';
import { ComputerDevice, type ComputerDeviceOpt } from './device';
import { RDPDevice, type RDPDeviceOpt } from './rdp/device';

export type ComputerInterface = ComputerDevice | RDPDevice;

export type RDPRemoteTargetOpt = RDPDeviceOpt & {
  type: 'rdp';
};

export type LocalComputerAgentOpt = AgentOpt &
  ComputerDeviceOpt & {
    remote?: undefined;
  };

export type RemoteComputerAgentOpt = AgentOpt & {
  remote: RDPRemoteTargetOpt;
};

export type ComputerAgentOpt = LocalComputerAgentOpt | RemoteComputerAgentOpt;

export class ComputerAgent<
  InterfaceType extends AbstractInterface = ComputerInterface,
> extends PageAgent<InterfaceType> {}

function isRemoteComputerAgentOpt(
  opts: ComputerAgentOpt | undefined,
): opts is RemoteComputerAgentOpt {
  return opts?.remote?.type === 'rdp';
}

function createLocalComputerDevice(
  opts: LocalComputerAgentOpt | undefined,
): ComputerDevice {
  return new ComputerDevice({
    displayId: opts?.displayId,
    customActions: opts?.customActions,
    keyboardDriver: opts?.keyboardDriver,
    headless: opts?.headless,
    xvfbResolution: opts?.xvfbResolution,
  });
}

function createComputerInterface(opts?: ComputerAgentOpt): ComputerInterface {
  if (isRemoteComputerAgentOpt(opts)) {
    const { type: _type, ...rdpOptions } = opts.remote;
    return new RDPDevice(rdpOptions);
  }

  return createLocalComputerDevice(opts);
}

export async function agentFromComputer(
  opts: RemoteComputerAgentOpt,
): Promise<ComputerAgent<RDPDevice>>;
export async function agentFromComputer(
  opts?: LocalComputerAgentOpt,
): Promise<ComputerAgent<ComputerDevice>>;

/**
 * Create an Agent from computer
 */
export async function agentFromComputer(
  opts?: ComputerAgentOpt,
): Promise<ComputerAgent> {
  const device = createComputerInterface(opts);
  await device.connect();
  return new ComputerAgent(device, opts);
}
