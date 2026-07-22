import { type AgentOpt, Agent as PageAgent } from '@midscene/core/agent';
import type { AbstractInterface } from '@midscene/core/device';
import { ComputerDevice, type ComputerDeviceOpt } from './device';
import { RDPDevice, type RDPDeviceOpt } from './rdp/device';

export type ComputerInterface = ComputerDevice | RDPDevice;

type ComputerAgentSharedDeviceOpt = Pick<
  ComputerDeviceOpt,
  'customActions' | 'keyboardTypeDelay'
>;

export type BaseComputerAgentOpt = AgentOpt & ComputerAgentSharedDeviceOpt;

export type LocalComputerAgentOpt = BaseComputerAgentOpt &
  Omit<ComputerDeviceOpt, keyof ComputerAgentSharedDeviceOpt>;

export type RDPComputerAgentOpt = BaseComputerAgentOpt &
  Omit<RDPDeviceOpt, keyof ComputerAgentSharedDeviceOpt>;
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
    keyboardTypeDelay: opts?.keyboardTypeDelay,
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
    localAddress: opts.localAddress,
    adminSession: opts.adminSession,
    ignoreCertificate: opts.ignoreCertificate,
    securityProtocol: opts.securityProtocol,
    desktopWidth: opts.desktopWidth,
    desktopHeight: opts.desktopHeight,
    backend: opts.backend,
    customActions: opts.customActions,
    keyboardTypeDelay: opts.keyboardTypeDelay,
  });
}

export async function agentForComputer(
  opts?: LocalComputerAgentOpt,
): Promise<ComputerAgent<ComputerDevice>>;

/**
 * Create an Agent for local computer
 */
export async function agentForComputer(
  opts?: ComputerAgentOpt,
): Promise<ComputerAgent> {
  const device = createLocalComputerDevice(opts);
  await device.connect();
  return new ComputerAgent(device, opts);
}

/**
 * @deprecated Use `agentForComputer` instead.
 */
export const agentFromComputer = agentForComputer;

export async function agentForRDPComputer(
  opts: RDPComputerAgentOpt,
): Promise<ComputerAgent<RDPDevice>> {
  const device = createRDPComputerDevice(opts);
  await device.connect();
  return new ComputerAgent(device, opts);
}
