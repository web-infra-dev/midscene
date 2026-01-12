import type { StorageProvider } from './storage';
import { MemoryStorage } from './storage';

/**
 * ScreenshotItem encapsulates screenshot data with storage abstraction.
 * Uses async getData() to load images on demand, reducing memory usage.
 *
 * Serialization format: { $screenshot: "id" }
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
   * If deletion from old provider fails, attempts rollback by removing from new provider.
   */
  async migrateTo(newProvider: StorageProvider): Promise<ScreenshotItem> {
    const data = await this.getData();
    const newId = await newProvider.store(data);

    try {
      await this._provider.delete(this._id);
      return new ScreenshotItem(newId, newProvider);
    } catch (error) {
      // Rollback: remove data from new provider
      try {
        await newProvider.delete(newId);
      } catch {
        // Ignore rollback failures
      }
      throw error;
    }
  }

  /** Serialize to { $screenshot: id } format for JSON */
  toSerializable(): { $screenshot: string } {
    return { $screenshot: this._id };
  }

  /** Check if a value is a serialized ScreenshotItem */
  static isSerialized(value: unknown): value is { $screenshot: string } {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    return '$screenshot' in obj && typeof obj.$screenshot === 'string';
  }
}
