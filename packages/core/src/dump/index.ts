/**
 * Dump module - utilities for HTML parsing and image restoration.
 */

// Utilities
export { restoreImageReferences } from './image-restoration';
export {
  escapeContent,
  unescapeContent,
  parseImageScripts,
  parseDumpScript,
  parseDumpScriptAttributes,
  generateImageScriptTag,
  generateDumpScriptTag,
} from './html-utils';
export {
  RuntimeArtifactStore,
  isScreenshotArtifactRef,
  screenshotArtifactRefFromPath,
} from './runtime-artifact-store';
export type {
  AgentExecutionEvent,
  AgentExecutionEventPayload,
  ExecutionUpdatedEvent,
  ReportFlushedEvent,
  ScreenshotArtifactRef,
  SerializedDumpObject,
  SerializedExecutionDumpObject,
} from './runtime-artifact-store';
