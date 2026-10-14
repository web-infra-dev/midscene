export { ComputerDevice } from './device';
export type { ComputerDeviceOpt, DisplayInfo } from './device';

export {
  ComputerAgent,
  agentForComputer,
  agentForRDPComputer,
  agentForRemoteComputer,
  agentFromComputer,
} from './agent';
export type {
  BaseComputerAgentOpt,
  ComputerAgentOpt,
  ComputerInterface,
  LocalComputerAgentOpt,
  RDPComputerAgentOpt,
  RemoteComputerAgentOpt,
} from './agent';

export { RemoteComputerDevice } from './remote/device';
export type { RemoteComputerDeviceOpt } from './remote/device';
export { startComputerBridge } from './remote/server';
export type {
  ComputerBridgeOptions,
  ComputerBridgeServer,
} from './remote/server';
export { COMPUTER_BRIDGE_PROTOCOL_VERSION } from './remote/protocol';
export type { ComputerBridgeConnectionInfo } from './remote/protocol';

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

export { ComputerMidsceneTools } from './agent-tools';
export { overrideAIConfig } from '@midscene/shared/env';
export {
  checkComputerEnvironment,
  getConnectedDisplays,
  checkAccessibilityPermission,
  checkScreenRecordingPermission,
  version,
} from './utils';

export { checkXvfbInstalled, needsXvfb } from './xvfb';
