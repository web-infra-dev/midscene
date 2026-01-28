import type { StorageProvider } from './storage';
import { MemoryStorage } from './storage';

/**
 * Serialized screenshot format for report output.
 * - 'inline': base64 data embedded directly
 * - 'file': relative path to external file
 */
export type SerializedScreenshot =
  | { type: 'inline'; data: string }
  | { type: 'file'; path: string };

/**
 * ScreenshotItem encapsulates screenshot data with storage abstraction.
 * Uses async getData() to load images on demand, reducing memory usage.
 */
export class ScreenshotItem {
  private _id: string;
  private _provider: StorageProvider;

  private constructor(id: string, provider: StorageProvider) {
    this._id = id;
    this._provider = provider;
  }

  /** Create a new ScreenshotItem from base64 data */
  static async create(
    base64: string,
    provider: StorageProvider = new MemoryStorage(),
  ): Promise<ScreenshotItem> {
    const id = await provider.store(base64);
    return new ScreenshotItem(id, provider);
  }

  /** Restore a ScreenshotItem from a stored ID (used when deserializing) */
  static restore(id: string, provider: StorageProvider): ScreenshotItem {
    return new ScreenshotItem(id, provider);
  }

  get id(): string {
    return this._id;
  }

  get provider(): StorageProvider {
    return this._provider;
  }

  /** Asynchronously retrieve the base64 data */
  async getData(): Promise<string> {
    return this._provider.retrieve(this._id);
  }

  /**
   * Migrate data to a different storage provider.
   *
   * **IMPORTANT**: This method returns a NEW ScreenshotItem instance. The original
   * instance becomes invalid after successful migration, as its data is deleted from
   * the old provider. Always use the returned instance and discard the old one.
   *
   * Migration process:
   * 1. Copy data to new provider
   * 2. Delete from old provider
   * 3. Return new ScreenshotItem pointing to new provider
   *
   * If deletion from old provider fails, attempts rollback by removing from new provider.
   * Note: If rollback also fails, data may exist in both providers (caller should handle cleanup).
   *
   * @param newProvider - The target storage provider to migrate to
   * @returns A new ScreenshotItem instance pointing to the new provider
   * @throws Error if migration fails (old provider deletion failed)
   *
   * @example
   * ```typescript
   * const oldItem = await ScreenshotItem.create(data, memoryStorage);
   * const newItem = await oldItem.migrateTo(fileStorage);
   * // IMPORTANT: Use newItem, not oldItem from this point forward
   * ```
   */
  async migrateTo(newProvider: StorageProvider): Promise<ScreenshotItem> {
    const data = await this.getData();
    const newId = await newProvider.store(data);

    try {
      await this._provider.delete(this._id);
      return new ScreenshotItem(newId, newProvider);
    } catch (error) {
      // Rollback: attempt to remove data from new provider
      try {
        await newProvider.delete(newId);
      } catch {
        // Rollback failed - data may exist in both providers
        // Caller should handle cleanup if needed
      }
      throw error;
    }
  }

  /**
   * Serialize screenshot for report output.
   *
   * @param mode - 'inline' to embed base64 data, 'file' to use external file path
   * @param filePath - Required for 'file' mode, the relative path to the screenshot file
   * @returns Serialized screenshot object
   *
   * @example
   * ```typescript
   * // Inline mode - embed base64 data
   * const inline = await screenshot.serialize('inline');
   * // { type: 'inline', data: 'data:image/png;base64,...' }
   *
   * // File mode - reference external file
   * const file = await screenshot.serialize('file', './screenshots/abc.png');
   * // { type: 'file', path: './screenshots/abc.png' }
   * ```
   */
  async serialize(mode: 'inline'): Promise<SerializedScreenshot>;
  async serialize(mode: 'file', filePath: string): Promise<SerializedScreenshot>;
  async serialize(
    mode: 'inline' | 'file',
    filePath?: string,
  ): Promise<SerializedScreenshot> {
    if (mode === 'inline') {
      const data = await this.getData();
      return { type: 'inline', data };
    }
    if (!filePath) {
      throw new Error('filePath is required for file mode serialization');
    }
    return { type: 'file', path: filePath };
  }

  /** @deprecated Use serialize() instead. Serialize to { $screenshot: id } format for JSON */
  toSerializable(): { $screenshot: string } {
    return { $screenshot: this._id };
  }

  /** Check if a value is a serialized ScreenshotItem (new format) */
  static isSerializedScreenshot(value: unknown): value is SerializedScreenshot {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    if (obj.type === 'inline' && typeof obj.data === 'string') {
      return true;
    }
    if (obj.type === 'file' && typeof obj.path === 'string') {
      return true;
    }
    return false;
  }

  /** @deprecated Check if a value is a serialized ScreenshotItem (legacy format) */
  static isSerialized(value: unknown): value is { $screenshot: string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      '$screenshot' in value &&
      typeof (value as Record<string, unknown>).$screenshot === 'string'
    );
  }
}
