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

// PlaygroundServer is not available in browser environments
export const PlaygroundServer = undefined;

export type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  ValidationResult,
  PlaygroundConfig,
  ExecutionType,
  PlaygroundAdapter,
} from './types';
