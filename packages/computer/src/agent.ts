import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import type { AbstractInterface } from '@midscene/core/device';
import { ComputerDevice, type ComputerDeviceOpt } from './device';
import { RDPDevice, type RDPDeviceOpt } from './rdp/device';

export type ComputerInterface = ComputerDevice | RDPDevice;

type ComputerAgentSharedDeviceOpt = Pick<ComputerDeviceOpt, 'customActions'>;

export type BaseComputerAgentOpt = AgentOpt & ComputerAgentSharedDeviceOpt;

export type LocalComputerAgentOpt = BaseComputerAgentOpt &
  Omit<ComputerDeviceOpt, 'customActions'>;

export type RDPComputerAgentOpt = BaseComputerAgentOpt &
  Omit<RDPDeviceOpt, 'customActions'>;
export type ComputerAgentOpt = LocalComputerAgentOpt;

export class ComputerAgent<
  InterfaceType extends AbstractInterface = ComputerInterface,
> extends PageAgent<InterfaceType> {}

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

function createRDPComputerDevice(opts: RDPComputerAgentOpt): RDPDevice {
  return new RDPDevice({
    host: opts.host,
    port: opts.port,
    username: opts.username,
    password: opts.password,
    domain: opts.domain,
    adminSession: opts.adminSession,
    ignoreCertificate: opts.ignoreCertificate,
    securityProtocol: opts.securityProtocol,
    desktopWidth: opts.desktopWidth,
    desktopHeight: opts.desktopHeight,
    backend: opts.backend,
    customActions: opts.customActions,
  });
}

export async function agentFromComputer(
  opts?: LocalComputerAgentOpt,
): Promise<ComputerAgent<ComputerDevice>>;

/**
 * Create an Agent from computer
 */
export async function agentFromComputer(
  opts?: ComputerAgentOpt,
): Promise<ComputerAgent> {
  const device = createLocalComputerDevice(opts);
  await device.connect();
  return new ComputerAgent(device, opts);
}

export async function agentForRDPComputer(
  opts: RDPComputerAgentOpt,
): Promise<ComputerAgent<RDPDevice>> {
  const device = createRDPComputerDevice(opts);
  await device.connect();
  return new ComputerAgent(device, opts);
}
