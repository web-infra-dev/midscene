/**
 * GEM Browser Remote Browser Integration
 * Main module exports
 */

// Main launch function and types
export { launchRemoteBrowser } from './agent';
export type { RemoteBrowserAgent } from './agent';

// Instance Manager (for advanced use cases)
export { FaaSInstanceManager } from './instance-manager';

// Page implementation (for advanced use cases)
export { RemoteBrowserPage } from './page';

// Constants
export {
  API_ENDPOINTS,
  COMMON_RESOLUTIONS,
  DEFAULT_CONFIG,
  GEM_BROWSER_ENVIRONMENTS,
  GEM_BROWSER_PLAYWRIGHT_ENVIRONMENTS,
  HEADERS,
  TTL_CONSTRAINTS,
  USER_AGENTS,
} from './constants';

// Types
export type {
  BrowserEngine,
  CdpConnectionError,
  CdpEndpointInfo,
  DisplayResolution,
  FaaSInstanceCreateOptions,
  FaaSInstanceCreateResponse,
  FaaSInstanceError,
  FaaSInstanceInfo,
  GemBrowserEnvironment,
  IRemoteBrowserPage,
  InstanceManagerConfig,
  RemoteBrowserError,
  RemoteBrowserOptions,
  VncOptions,
} from './types';

// Re-export overrideAIConfig from shared
export { overrideAIConfig } from '@midscene/shared/env';
