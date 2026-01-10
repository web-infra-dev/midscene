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
export { ExecutionDumpNew } from './execution-dump';
export { GroupedActionDumpNew } from './grouped-action-dump';

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
