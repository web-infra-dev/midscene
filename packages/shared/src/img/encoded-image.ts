import { Buffer } from 'node:buffer';
import type { Size } from '../types';
import {
  type NormalizeScreenshotBase64Options,
  parseScreenshotBase64,
} from './base64';
import {
  type ScreenshotImageFormat,
  detectScreenshotImageFormatFromBuffer,
  screenshotImageMimeType,
} from './image-format';
import { encodedImageInfoOfBuffer } from './info';

/** Encoded file bytes, not decoded pixels. Treat the owned bytes as immutable. */
export class EncodedImage {
  private cachedSize?: Readonly<Size>;

  private constructor(
    readonly bytes: Uint8Array,
    readonly format: ScreenshotImageFormat,
  ) {}

  /** Takes ownership without copying. Callers must not mutate bytes afterwards. */
  static fromBytes(bytes: Uint8Array, expectedFormat?: ScreenshotImageFormat) {
    const format = detectScreenshotImageFormatFromBuffer(
      Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    );
    if (!format) throw new Error('Image bytes must contain PNG, JPEG, or WebP');
    if (expectedFormat && expectedFormat !== format) {
      throw new Error(
        `Image declares ${screenshotImageMimeType(expectedFormat)} but encoded bytes are ${screenshotImageMimeType(format)}`,
      );
    }
    return new EncodedImage(bytes, format);
  }

  static fromBase64(
    base64: string,
    options?: NormalizeScreenshotBase64Options,
  ) {
    const { bytes, format } = parseScreenshotBase64(base64, options);
    return new EncodedImage(bytes, format);
  }

  /** Read the encoded header once, without loading a pixel decoder. */
  get size(): Readonly<Size> {
    this.cachedSize ??= Object.freeze(
      encodedImageInfoOfBuffer(
        Buffer.from(
          this.bytes.buffer,
          this.bytes.byteOffset,
          this.bytes.byteLength,
        ),
      ),
    );
    return this.cachedSize;
  }

  toBase64(): string {
    return `data:${screenshotImageMimeType(this.format)};base64,${Buffer.from(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength).toString('base64')}`;
  }
}
