/**
 * ScreenshotItem encapsulates screenshot data.
 * This is a simple wrapper class that prepares for future storage optimization.
 *
 * Current implementation: stores base64 string directly in memory
 * Future: can be extended to use storage providers (file system, IndexedDB, etc.)
 */
export class ScreenshotItem {
  private _data: string;

  private constructor(data: string) {
    this._data = data;
  }

  /** Create a new ScreenshotItem from base64 data */
  static create(base64: string): ScreenshotItem {
    return new ScreenshotItem(base64);
  }

  /** Get the base64 data synchronously */
  getData(): string {
    return this._data;
  }

  /** Serialize to base64 string for JSON */
  toSerializable(): string {
    return this._data;
  }

  /**
   * Check if a value looks like serialized screenshot data
   * (non-empty base64 string)
   */
  static isSerializedData(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0;
  }

  /**
   * Deserialize from base64 string back to ScreenshotItem
   * This is the counterpart of toSerializable()
   */
  static fromSerializedData(data: string): ScreenshotItem {
    return new ScreenshotItem(data);
  }
}
