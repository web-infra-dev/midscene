import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScreenshotBase64 } from '../img/base64';
import {
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

export function writeCliScreenshotFile(
  rawBase64: string,
  options: WriteCliScreenshotFileOptions = {},
): string {
  const parsed = parseScreenshotBase64(rawBase64, {
    label: 'CLI screenshot',
  });
  const declaredMimeFormat = screenshotImageFormatFromMimeType(
    options.mimeType,
  );
  const declaredExtensionFormat = screenshotImageFormatFromExtension(
    options.extension,
  );
  if (options.mimeType !== undefined && !declaredMimeFormat) {
    throw new Error(`Unsupported screenshot MIME type: ${options.mimeType}`);
  }
  if (options.extension !== undefined && !declaredExtensionFormat) {
    throw new Error(`Unsupported screenshot extension: ${options.extension}`);
  }
  for (const [label, declaredFormat] of [
    ['MIME type', declaredMimeFormat],
    ['extension', declaredExtensionFormat],
  ] as const) {
    if (declaredFormat && declaredFormat !== parsed.format) {
      throw new Error(
        `CLI screenshot ${label} describes ${declaredFormat}, but encoded bytes are ${parsed.format}`,
      );
    }
  }
  const extension = parsed.extension;
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
    writeFileSync(filePath, parsed.bytes);
  }

  return filePath;
}
