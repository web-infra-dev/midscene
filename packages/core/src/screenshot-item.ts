import { readFileSync } from 'node:fs';
import {
  type ScreenshotImageFormat,
  type ScreenshotImageMimeType,
  inferScreenshotImageFormatFromBase64,
  screenshotImageExtension,
  screenshotImageFormatFromMimeType,
  screenshotImageMimeType,
} from '@midscene/shared/img/image-format';
import { uuid } from '@midscene/shared/utils';
import { extractImageByIdSync } from './dump/html-utils';
import {
  type ScreenshotRef,
  normalizeScreenshotRef,
} from './dump/screenshot-store';

/**
 * Serialization format for ScreenshotItem
 * - { $screenshot: "id" } - inline mode, references imageMap in HTML
 * - { base64: "path" } - directory mode, references external file path
 */
export type ScreenshotSerializeFormat = ScreenshotRef;

const BASE64_SEPARATOR = ';base64,';

/**
 * Detect image format from a data URI or raw base64 body.
 */
function detectFormat(base64: string): ScreenshotImageFormat {
  // Web integrations use an empty ScreenshotItem as a temporary placeholder.
  // Keep its historical PNG metadata until the real screenshot is attached.
  if (base64 === '') {
    return 'png';
  }

  const separatorIndex = base64.indexOf(BASE64_SEPARATOR);
  const mimeType =
    separatorIndex === -1 ? undefined : base64.slice(5, separatorIndex);
  const format =
    separatorIndex === -1
      ? inferScreenshotImageFormatFromBase64(base64)
      : screenshotImageFormatFromMimeType(mimeType);
  if (!format) {
    throw new Error(
      `ScreenshotItem: unsupported image format ${mimeType ?? 'unknown'}`,
    );
  }
  return format;
}

function rawBase64Body(base64: string): string {
  const separatorIndex = base64.indexOf(BASE64_SEPARATOR);
  const body =
    separatorIndex === -1
      ? base64
      : base64.slice(separatorIndex + BASE64_SEPARATOR.length);
  return body.replace(/\s/g, '');
}

/**
 * ScreenshotItem encapsulates screenshot data.
 *
 * Supports lazy loading after memory release:
 * - inline mode: reads from HTML file using streaming (extractImageByIdSync)
 * - directory mode: reads from file on disk
 *
 * After persistence, memory is released but the screenshot can be recovered
 * on-demand from disk, making it safe to release memory at any time.
 */
export class ScreenshotItem {
  private _id: string;
  private _base64: string | null;
  private _format: ScreenshotImageFormat;
  private _capturedAt: number;
  private _serializedRef: ScreenshotRef | null = null;
  private _persistedPath: string | null = null;
  private _persistedHtmlPath: string | null = null;

  private constructor(id: string, base64: string, capturedAt: number) {
    this._id = id;
    this._base64 = base64;
    this._format = detectFormat(base64);
    this._capturedAt = capturedAt;
  }

  /** Create a new ScreenshotItem from base64 data */
  static create(base64: string, capturedAt: number): ScreenshotItem {
    return new ScreenshotItem(uuid(), base64, capturedAt);
  }

  get id(): string {
    return this._id;
  }

  /** Get the image format (PNG, JPEG, or WebP). */
  get format(): ScreenshotImageFormat {
    return this._format;
  }

  /** Get the file extension for this screenshot */
  get extension(): ScreenshotImageFormat {
    return screenshotImageExtension(this._format);
  }

  /** Get the MIME type for this screenshot. */
  get mimeType(): ScreenshotImageMimeType {
    return screenshotImageMimeType(this._format);
  }

  /** Get screenshot capture timestamp in milliseconds */
  get capturedAt(): number {
    return this._capturedAt;
  }

  get base64(): string {
    // If data is in memory, return it directly
    if (this._base64 !== null) {
      return this._base64;
    }

    const loadFromFile = (): string => {
      if (this._persistedPath === null) {
        throw new Error(`Screenshot ${this._id}: file recovery path missing`);
      }
      const buffer = readFileSync(this._persistedPath);
      return `data:${this.mimeType};base64,${buffer.toString('base64')}`;
    };

    const loadFromInline = (): string => {
      if (this._persistedHtmlPath === null) {
        throw new Error(`Screenshot ${this._id}: HTML recovery path missing`);
      }
      const data = extractImageByIdSync(this._persistedHtmlPath, this._id);
      if (data) {
        return data;
      }
      throw new Error(
        `Screenshot ${this._id}: cannot recover from HTML (id not found in ${this._persistedHtmlPath})`,
      );
    };

    // Recover from the primary serialized mode first.
    if (this._serializedRef?.storage === 'file') {
      return loadFromFile();
    }

    if (this._serializedRef?.storage === 'inline') {
      return loadFromInline();
    }

    // Fall back to whichever recovery path is available.
    if (this._persistedPath !== null) {
      return loadFromFile();
    }

    if (this._persistedHtmlPath !== null) {
      return loadFromInline();
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
  markPersistedInline(htmlPath: string): ScreenshotRef {
    const ref = this.createRef('inline');
    this._serializedRef = ref;
    this._persistedHtmlPath = htmlPath;
    this._base64 = null;
    return ref;
  }

  /**
   * Register a file-backed recovery path without changing the serialized mode.
   * Used when inline persistence also needs a shared file copy next to dumps.
   */
  registerPersistedFileCopy(
    relativePath: string,
    absolutePath: string,
  ): ScreenshotRef {
    const ref = this.createRef('file', relativePath);
    this._persistedPath = absolutePath;
    this._base64 = null;
    return ref;
  }

  /**
   * Mark as persisted to file (directory mode).
   * Releases base64 memory, but keeps file path for lazy loading recovery.
   * @param relativePath - relative path for serialization (e.g., "./screenshots/id.jpeg")
   * @param absolutePath - absolute path for lazy loading recovery
   */
  markPersistedToPath(
    relativePath: string,
    absolutePath: string,
  ): ScreenshotRef {
    const ref = this.registerPersistedFileCopy(relativePath, absolutePath);
    this._serializedRef = ref;
    return ref;
  }

  /** Serialize for JSON - format depends on persistence state */
  toSerializable(): ScreenshotSerializeFormat {
    return (
      this._serializedRef ?? {
        type: 'midscene_screenshot_ref',
        id: this._id,
        capturedAt: this._capturedAt,
        mimeType: this.mimeType,
        storage: 'inline',
      }
    );
  }

  /** Check if a value is a serialized ScreenshotItem reference (inline or directory mode) */
  static isSerialized(value: unknown): value is ScreenshotSerializeFormat {
    return normalizeScreenshotRef(value) !== null;
  }

  private createRef(
    storage: 'inline' | 'file',
    relativePath?: string,
  ): ScreenshotRef {
    const baseRef: Omit<ScreenshotRef, 'path'> = {
      type: 'midscene_screenshot_ref',
      id: this._id,
      capturedAt: this._capturedAt,
      mimeType: this.mimeType,
      storage,
    };
    if (storage === 'file') {
      return {
        ...baseRef,
        storage,
        path: relativePath!,
      };
    }
    return baseRef;
  }

  /**
   * Get base64 data without the data URI prefix.
   * Useful for writing raw binary data to files.
   */
  get rawBase64(): string {
    return rawBase64Body(this.base64);
  }
}
