/**
 * Storage abstraction for screenshot data.
 *
 * @example Browser environment (default):
 * ```typescript
 * import { MemoryStorage } from '@midscene/core';
 * const storage = new MemoryStorage();
 * ```
 *
 * @example Node.js environment:
 * ```typescript
 * import { FileStorage } from '@midscene/core/storage/file';
 * const storage = new FileStorage('/path/to/screenshots');
 * ```
 */
export type { StorageProvider } from './provider';
export { MemoryStorage } from './memory';

// Note: FileStorage is Node.js only and uses node:fs
// Import directly from '@midscene/core/storage/file' to avoid bundling node modules
export type { FileStorage } from './file';
