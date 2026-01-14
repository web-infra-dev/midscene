/**
 * Dump module - handles serialization, deserialization, and report generation.
 *
 * Core classes are in ../types.ts:
 * - GroupedActionDump: Top-level container for execution dumps
 * - ExecutionDump: Single execution session with tasks
 */

// Types
export type {
  SerializedScreenshot,
  SerializableRecorderItem,
  SerializableExecutionTask,
  SerializableExecutionDump,
  SerializableGroupedActionDump,
  ToHTMLOptions,
  WriteToDirectoryOptions,
  SerializeWithImagesResult,
} from './types';

// Re-export classes from types.ts
export { ExecutionDump, GroupedActionDump } from '../types';

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
