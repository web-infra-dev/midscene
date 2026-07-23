import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type ScreenshotImageFormat,
  screenshotImageFormatFromExtension,
  screenshotImageFormatFromMimeType,
} from '../img/image-format';

export interface WriteCliScreenshotFileOptions {
  id?: unknown;
  mimeType?: unknown;
  extension?: unknown;
  directoryPath?: string;
  directoryName?: string;
  filenamePrefix?: string;
  overwrite?: boolean;
}

function safeScreenshotFilenamePart(value: unknown): string {
  const text = typeof value === 'string' && value.length > 0 ? value : 'shot';
  return text.replace(/[^a-zA-Z0-9._-]/g, '_') || 'shot';
}

function extensionFromImageMetadata(
  mimeType: unknown,
  extension: unknown,
): ScreenshotImageFormat {
  const extensionFormat = screenshotImageFormatFromExtension(extension);
  if (extensionFormat) {
    return extensionFormat;
  }
  return screenshotImageFormatFromMimeType(mimeType) ?? 'png';
}

export function writeCliScreenshotFile(
  rawBase64: string,
  options: WriteCliScreenshotFileOptions = {},
): string {
  const extension = extensionFromImageMetadata(
    options.mimeType,
    options.extension,
  );
  const directory = options.directoryPath
    ? options.directoryPath
    : options.directoryName
      ? join(tmpdir(), options.directoryName)
      : tmpdir();
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  const filename =
    options.id !== undefined
      ? `${safeScreenshotFilenamePart(options.id)}.${extension}`
      : `${options.filenamePrefix ?? 'screenshot'}-${Date.now()}.${extension}`;
  const filePath = join(directory, filename);

  if (options.overwrite !== false || !existsSync(filePath)) {
    writeFileSync(filePath, Buffer.from(rawBase64, 'base64'));
  }

  return filePath;
}
