import { readFileSync } from 'node:fs';
import { uuid } from '@midscene/shared/utils';
import { extractImageByIdSync } from './dump/html-utils';

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
 * Supports lazy loading after memory release:
 * - inline mode: reads from HTML file using streaming (extractImageByIdSync)
 * - directory mode: reads from PNG file
 *
 * After persistence, memory is released but the screenshot can be recovered
 * on-demand from disk, making it safe to release memory at any time.
 */
export class ScreenshotItem {
  private _id: string;
  private _base64: string | null;
  private _persistedAs: ScreenshotSerializeFormat | null = null;
  private _persistedPath: string | null = null; // directory mode: PNG file path
  private _persistedHtmlPath: string | null = null; // inline mode: HTML file path

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
    // If data is in memory, return it directly
    if (this._base64 !== null) {
      return this._base64;
    }

    // Directory mode: recover from PNG file
    if (this._persistedPath !== null) {
      const buffer = readFileSync(this._persistedPath);
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }

    // Inline mode: recover from HTML file using streaming
    if (this._persistedHtmlPath !== null) {
      const data = extractImageByIdSync(this._persistedHtmlPath, this._id);
      if (data) {
        return data;
      }
      throw new Error(
        `Screenshot ${this._id}: cannot recover from HTML (id not found in ${this._persistedHtmlPath})`,
      );
    }

    throw new Error(
      `Screenshot ${this._id}: base64 data released without recovery path`,
    );
  }

  /** Check if base64 data is still available in memory (not yet released) */
  hasBase64(): boolean {
    return this._base64 !== null;
  }

  /**
   * Mark as persisted to HTML (inline mode).
   * Releases base64 memory, but keeps HTML path for lazy loading recovery.
   * @param htmlPath - absolute path to the HTML file containing the image
   */
  markPersistedInline(htmlPath: string): void {
    this._persistedAs = { $screenshot: this._id };
    this._persistedHtmlPath = htmlPath;
    this._base64 = null;
  }

  /**
   * Mark as persisted to file (directory mode).
   * Releases base64 memory, but keeps file path for lazy loading recovery.
   * @param relativePath - relative path for serialization (e.g., "./screenshots/id.png")
   * @param absolutePath - absolute path for lazy loading recovery
   */
  markPersistedToPath(relativePath: string, absolutePath: string): void {
    this._persistedAs = { base64: relativePath };
    this._persistedPath = absolutePath;
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
