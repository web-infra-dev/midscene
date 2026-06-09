/**
 * Dump module - utilities for HTML parsing and image restoration.
 */

// Utilities
export { GroupedActionDump } from './report-action-dump';
export type { IExecutionDump, IReportActionDump } from '../types';
export { restoreImageReferences } from './screenshot-restoration';
export {
  escapeContent,
  unescapeContent,
  parseImageScripts,
  parseDumpScript,
  parseDumpScriptAttributes,
  generateImageScriptTag,
  generateDumpScriptTag,
} from './html-utils';
