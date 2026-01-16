/**
 * Storage abstraction for screenshot data.
 * Allows pluggable backends (memory, file, remote) to manage image data.
 */
export interface StorageProvider {
  readonly type: 'memory' | 'file' | 'remote';

  /** Store data and return a unique ID */
  store(data: string): Promise<string>;

  /** Store data with a specific ID (for rehydration from serialized data) */
  storeWithId(id: string, data: string): Promise<void>;

  /** Retrieve data by ID */
  retrieve(id: string): Promise<string>;

  /** Delete data by ID */
  delete(id: string): Promise<void>;

  /** Clean up all stored data */
  cleanup(): Promise<void>;
}
