/**
 * Dump module - utilities for HTML parsing and image restoration.
 */

// Utilities
export {
  createInlineImageResolver,
  restoreImageReferences,
  restoreReportImageReferences,
} from './screenshot-restoration';
export type {
  RestoredScreenshotReference,
  StoredImageReferenceResolver,
} from './screenshot-restoration';
export type {
  ImageUrlRef,
  ScreenshotRef,
  StoredImageRef,
} from './image-reference';
export {
  imageFileExtensionForMimeType,
  imageMimeTypeForFileExtension,
} from './image-reference';
export {
  ReportImageStore,
  ScreenshotStore,
  normalizeStoredImageRef,
  parseBase64ImageDataUrl,
  resolveImageSource,
} from './screenshot-store';
export {
  escapeContent,
  unescapeContent,
  parseImageScripts,
  parseDumpScript,
  parseDumpScriptAttributes,
  generateImageScriptTag,
  generateDumpScriptTag,
} from './html-utils';
export { getTaskSearchArea, getTaskServiceDump } from './task-service-dump';
export {
  deriveTaskStatus,
  deriveCaseStatus,
  type TaskStatusFields,
  type DerivedTaskStatus,
} from './task-status';
