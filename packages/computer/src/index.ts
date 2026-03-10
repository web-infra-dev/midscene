export { ComputerDevice } from './device';
export type { ComputerDeviceOpt, DisplayInfo } from './device';

export { ComputerAgent, agentFromComputer } from './agent';
export type { ComputerAgentOpt } from './agent';

export { ComputerMidsceneTools } from './mcp-tools';
export { overrideAIConfig } from '@midscene/shared/env';
export {
  checkComputerEnvironment,
  getConnectedDisplays,
  checkAccessibilityPermission,
  version,
} from './utils';

export { checkXvfbInstalled, needsXvfb } from './xvfb';
