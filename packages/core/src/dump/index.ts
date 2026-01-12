// Types
export type {
  SerializedScreenshot,
  SerializableRecorderItem,
  SerializableExecutionTask,
  SerializableExecutionDump,
  SerializableGroupedActionDump,
  ToHTMLOptions,
  SerializeWithImagesResult,
  ExecutionDumpInit,
  GroupedActionDumpInit,
} from './types';

// Classes
export { ExecutionDump } from './execution-dump';
export { GroupedActionDump } from './grouped-action-dump';

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
