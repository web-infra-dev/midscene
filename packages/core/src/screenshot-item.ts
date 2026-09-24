import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import {
  EncodedImage,
  type ScreenshotImageFormat,
  type ScreenshotImageMimeType,
  screenshotImageExtension,
  screenshotImageFormatFromMimeType,
  screenshotImageMimeType,
} from '@midscene/shared/img';
import { uuid } from '@midscene/shared/utils';
import { extractImageByIdSync } from './dump/html-utils';
import {
  type ScreenshotRef,
  normalizeScreenshotRef,
} from './dump/image-reference';

/**
 * Serialization format for ScreenshotItem
 * - { $screenshot: "id" } - inline mode, references imageMap in HTML
 * - { base64: "path" } - directory mode, references external file path
 */
export type ScreenshotSerializeFormat = ScreenshotRef;

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
  private _image: EncodedImage | null;
  private _format: ScreenshotImageFormat;
  private _capturedAt: number;
  private _serializedRef: ScreenshotRef | null = null;
  private _persistedPath: string | null = null;
  private _persistedHtmlPath: string | null = null;

  private constructor(
    id: string,
    image: EncodedImage | null,
    capturedAt: number,
    format: ScreenshotImageFormat,
  ) {
    this._id = id;
    this._image = image;
    this._format = format;
    this._capturedAt = capturedAt;
    // JSON transport remains Base64, without exposing or duplicating the byte
    // buffer. Dump serializers still receive the ScreenshotItem instance first.
    Object.defineProperty(this, '_image', { enumerable: false });
    Object.defineProperty(this, 'base64', {
      enumerable: true,
      get: () => this.image.toBase64(),
    });
  }

  /** Create a new ScreenshotItem from base64 data */
  static create(base64: string, capturedAt: number): ScreenshotItem {
    return ScreenshotItem.fromImage(
      EncodedImage.fromBase64(base64, { label: 'ScreenshotItem base64' }),
      capturedAt,
    );
  }

  static fromImage(image: EncodedImage, capturedAt: number): ScreenshotItem {
    return new ScreenshotItem(uuid(), image, capturedAt, image.format);
  }

  /** Create a lazily loaded ScreenshotItem backed by an image file. */
  static fromFile(
    filePath: string,
    mimeType: ScreenshotImageMimeType,
    capturedAt: number,
  ): ScreenshotItem {
    const fileBytes = readFileSync(filePath);
    const expectedFormat = screenshotImageFormatFromMimeType(mimeType);
    if (!expectedFormat)
      throw new Error(`Unsupported screenshot MIME type: ${mimeType}`);
    const image = EncodedImage.fromBytes(fileBytes, expectedFormat);
    const item = new ScreenshotItem(uuid(), null, capturedAt, image.format);
    item._persistedPath = filePath;
    return item;
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
    return this.image.toBase64();
  }

  get image(): EncodedImage {
    // If data is in memory, return it directly
    if (this._image !== null) {
      return this._image;
    }

    const loadFromFile = (): EncodedImage => {
      if (this._persistedPath === null) {
        throw new Error(`Screenshot ${this._id}: file recovery path missing`);
      }
      const buffer = readFileSync(this._persistedPath);
      return EncodedImage.fromBytes(buffer, this._format);
    };

    const loadFromInline = (): EncodedImage => {
      if (this._persistedHtmlPath === null) {
        throw new Error(`Screenshot ${this._id}: HTML recovery path missing`);
      }
      const data = extractImageByIdSync(this._persistedHtmlPath, this._id);
      if (data) {
        const image = EncodedImage.fromBase64(data);
        if (image.format !== this._format)
          throw new Error('Persisted screenshot format changed');
        return image;
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

  /** Compatibility name: whether encoded image bytes are still held in memory. */
  hasBase64(): boolean {
    return this._image !== null;
  }

  /**
   * Mark as persisted to HTML (inline mode).
   * Releases encoded image memory, keeping an HTML recovery path.
   * @param htmlPath - absolute path to the HTML file containing the image
   */
  markPersistedInline(htmlPath: string): ScreenshotRef {
    const ref = this.createRef('inline');
    this._serializedRef = ref;
    this._persistedHtmlPath = htmlPath;
    this._image = null;
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
    this._image = null;
    return ref;
  }

  /**
   * Mark as persisted to file (directory mode).
   * Releases encoded image memory, keeping a file recovery path.
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
   * Base64 transport compatibility. File writers should use image.bytes instead.
   */
  get rawBase64(): string {
    const { bytes } = this.image;
    return Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).toString('base64');
  }
}
