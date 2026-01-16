/**
 * Serialized format for ScreenshotItem
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

  /** Get the base64 data */
  get base64(): string {
    return this._data;
  }

  /** Serialize to object format for JSON */
  toSerializable(): SerializedScreenshotItem {
    return { base64: this._data };
  }

  /**
   * toJSON for automatic JSON.stringify support
   * Ensures ScreenshotItem instances serialize correctly without custom replacer
   */
  toJSON(): SerializedScreenshotItem {
    return this.toSerializable();
  }

  /**
   * Check if a value looks like serialized screenshot data
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

  /**
   * Extract base64 string from any screenshot format
   * Handles ScreenshotItem instances, SerializedScreenshotItem objects, and plain strings
   *
   * @param value - Screenshot data in any format
   * @returns Base64 string, or empty string if invalid
   */
  static toBase64String(value: unknown): string {
    if (!value) {
      return '';
    }

    // Already a string
    if (typeof value === 'string') {
      return value;
    }

    // ScreenshotItem instance or SerializedScreenshotItem object
    if (typeof value === 'object' && 'base64' in value) {
      const base64 = (value as any).base64;
      return typeof base64 === 'string' ? base64 : '';
    }

    return '';
  }
}
