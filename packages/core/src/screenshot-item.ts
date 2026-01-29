import { uuid } from '@midscene/shared/utils';

/**
 * Serialization format for ScreenshotItem
 * - { $screenshot: "id" } - inline mode, references imageMap in HTML
 * - { base64: "path" } - directory mode, references external file path
 */
export type ScreenshotSerializeFormat =
  | { $screenshot: string }
  | { base64: string };

/**
 * ScreenshotItem encapsulates screenshot data.
 *
 * Supports memory release after persistence:
 * - inline mode: call markPersistedInline() after writing to HTML
 * - directory mode: call markPersistedToPath() after writing to file
 */
export class ScreenshotItem {
  private _id: string;
  private _base64: string | null;
  private _persistedAs: ScreenshotSerializeFormat | null = null;

  private constructor(id: string, base64: string) {
    this._id = id;
    this._base64 = base64;
  }

  /** Create a new ScreenshotItem from base64 data */
  static create(base64: string): ScreenshotItem {
    return new ScreenshotItem(uuid(), base64);
  }

  get id(): string {
    return this._id;
  }

  get base64(): string {
    if (this._base64 === null) {
      throw new Error(
        `Screenshot ${this._id}: base64 data already released after persistence`,
      );
    }
    return this._base64;
  }

  /** Check if base64 data is still available (not yet released) */
  hasBase64(): boolean {
    return this._base64 !== null;
  }

  /**
   * Mark as persisted to HTML (inline mode).
   * Releases base64 memory, serializes as { $screenshot: id }
   */
  markPersistedInline(): void {
    this._persistedAs = { $screenshot: this._id };
    this._base64 = null;
  }

  /**
   * Mark as persisted to file (directory mode).
   * Releases base64 memory, serializes as { base64: path }
   * @param path - relative path to the screenshot file (e.g., "./screenshots/id.png")
   */
  markPersistedToPath(path: string): void {
    this._persistedAs = { base64: path };
    this._base64 = null;
  }

  /** Serialize for JSON - format depends on persistence state */
  toSerializable(): ScreenshotSerializeFormat {
    return this._persistedAs ?? { $screenshot: this._id };
  }

  /** Check if a value is a serialized ScreenshotItem reference (inline or directory mode) */
  static isSerialized(value: unknown): value is ScreenshotSerializeFormat {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    // Check for inline mode: { $screenshot: string }
    if ('$screenshot' in record && typeof record.$screenshot === 'string') {
      return true;
    }
    // Check for directory mode: { base64: string } where base64 is a path
    if ('base64' in record && typeof record.base64 === 'string') {
      return true;
    }
    return false;
  }

  /**
   * Get base64 data without the data URI prefix.
   * Useful for writing raw binary data to files.
   */
  get rawBase64(): string {
    return this.base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
  }
}
