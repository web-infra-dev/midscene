export {
  ScreenRelayDevice,
  type ScreenRelayDeviceOpt,
} from './device';

export {
  ScreenRelayAgent,
  agentForScreenRelay,
  type AgentForScreenRelayOpt,
  type ScreenRelayAgentOpt,
} from './agent';

export {
  formatScreenRelayError,
  isRelayError,
  type ScreenRelayCapabilities,
} from './client';

export {
  DEFAULT_SCREEN_RELAY_URL,
  MIDSCENE_SCREEN_RELAY_TOKEN,
  MIDSCENE_SCREEN_RELAY_URL,
  normalizeScreenRelayKey,
  parseScreenRelayTarget,
  readPngDimensions,
  sanitizeScreenRelayCliArgs,
  type ResolvedScreenRelayTarget,
} from './target';

export { overrideAIConfig } from '@midscene/shared/env';
