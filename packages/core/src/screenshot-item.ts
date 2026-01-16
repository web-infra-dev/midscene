/**
 * Serialized format of ScreenshotItem for JSON serialization
 */
export interface SerializedScreenshotItem {
  base64: string;
}

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
  get base64(): string {
    return this._data;
  }

  /** @deprecated Use the base64 getter instead */
  getData(): string {
    return this._data;
  }

  /** Serialize to object format for JSON */
  toSerializable(): SerializedScreenshotItem {
    return { base64: this._data };
  }

  /**
   * Check if a value looks like serialized screenshot data
   * (object with base64 property)
   */
  static isSerializedData(value: unknown): value is SerializedScreenshotItem {
    return (
      typeof value === 'object' &&
      value !== null &&
      'base64' in value &&
      typeof (value as SerializedScreenshotItem).base64 === 'string'
    );
  }

  /**
   * Deserialize from SerializedScreenshotItem back to ScreenshotItem
   * This is the counterpart of toSerializable()
   */
  static fromSerializedData(data: SerializedScreenshotItem): ScreenshotItem {
    return new ScreenshotItem(data.base64);
  }
}
