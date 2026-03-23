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
export const launchPreparedPlaygroundPlatform = undefined;

export type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  ValidationResult,
  PlaygroundConfig,
  ExecutionType,
  PlaygroundAdapter,
} from './types';
export type {
  PlaygroundPlatformDescriptor,
  PlaygroundPreviewCapability,
  PlaygroundPreviewDescriptor,
  PlaygroundPreviewKind,
  PreparedPlaygroundPlatform,
} from './platform';
