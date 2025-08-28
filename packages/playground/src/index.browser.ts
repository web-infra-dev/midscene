// Browser-safe version of playground exports (excludes server)
export { StaticPageAgent } from './static-agent';
export {
  dataExtractionAPIs,
  noReplayAPIs,
  validationAPIs,
  formatErrorMessage,
  validateStructuredParams,
  executeAction,
} from './common';
export { default as StaticPage } from './static-page';

// PlaygroundServer is not available in browser environments
export const PlaygroundServer = undefined;

export type {
  ExecutionOptions,
  FormValue,
  PlaygroundAgent,
  ValidationResult,
} from './types';
