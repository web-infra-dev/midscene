// Browser-safe version of playground exports (excludes server)
export {
  dataExtractionAPIs,
  noReplayAPIs,
  validationAPIs,
  formatErrorMessage,
  validateStructuredParams,
  executeAction,
} from './common';

// SDK exports (all browser-safe)
export { PlaygroundSDK } from './sdk';
export { BasePlaygroundAdapter } from './adapters/base';
export { LocalExecutionAdapter } from './adapters/local-execution';
export { RemoteExecutionAdapter } from './adapters/remote-execution';
export {
  createMjpegPreviewDescriptor,
  createScreenshotPreviewDescriptor,
  createScrcpyPreviewDescriptor,
  definePlaygroundPlatform,
  resolvePreparedLaunchOptions,
} from './platform';

// PlaygroundServer is not available in browser environments
export const PlaygroundServer = undefined;
export const playgroundForAgent = undefined;
export const playgroundForAgentFactory = undefined;
export const playgroundForSessionManager = undefined;
export const launchPreparedPlaygroundPlatform = undefined;

export type {
  BeforeActionHook,
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  ValidationResult,
  PlaygroundConfig,
  ExecutionType,
  PlaygroundAdapter,
} from './types';
export type {
  PlaygroundCreatedSession,
  PlaygroundPlatformDescriptor,
  PlaygroundPreviewCapability,
  PlaygroundPreviewDescriptor,
  PlaygroundPreviewKind,
  PreparedPlaygroundPlatform,
  PlaygroundSessionField,
  PlaygroundSessionFieldOption,
  PlaygroundSessionManager,
  PlaygroundSessionNotice,
  PlaygroundSessionSetup,
  PlaygroundSessionState,
  PlaygroundSessionTarget,
} from './platform';
export type { PlaygroundRuntimeInfo } from './runtime-metadata';
