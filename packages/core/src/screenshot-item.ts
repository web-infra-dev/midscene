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
}

/**
 * Helper function to get base64 data from screenshot
 * Handles both ScreenshotItem object and plain base64 string (for deserialized data)
 */
export function getScreenshotData(screenshot: ScreenshotItem | string | undefined): string {
  if (!screenshot) {
    return '';
  }
  if (typeof screenshot === 'string') {
    return screenshot;
  }
  return screenshot.getData();
}
