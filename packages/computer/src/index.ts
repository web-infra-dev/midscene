export { ComputerDevice } from './device';
export type { ComputerDeviceOpt, DisplayInfo } from './device';

export { ComputerAgent, agentFromComputer } from './agent';
export type {
  ComputerAgentOpt,
  ComputerInterface,
  LocalComputerAgentOpt,
  RDPRemoteTargetOpt,
  RemoteComputerAgentOpt,
} from './agent';

export { RDPDevice } from './rdp/device';
export type { RDPDeviceOpt } from './rdp/device';
export {
  HelperProcessRDPBackendClient,
  createDefaultRDPBackendClient,
  UnsupportedRDPBackendClient,
} from './rdp/backend-client';
export type {
  RDPBackendClient,
  RDPConnectionConfig,
  RDPConnectionInfo,
  RDPHelperEnvelope,
  RDPHelperRequest,
  RDPHelperResponse,
  RDPMouseButton,
  RDPMouseButtonAction,
  RDPProtocolRequest,
  RDPProtocolResponse,
  RDPSecurityProtocol,
  RDPScrollDirection,
} from './rdp/protocol';

export { ComputerMidsceneTools } from './mcp-tools';
export { overrideAIConfig } from '@midscene/shared/env';
export {
  checkComputerEnvironment,
  getConnectedDisplays,
  checkAccessibilityPermission,
  version,
} from './utils';

export { checkXvfbInstalled, needsXvfb } from './xvfb';
