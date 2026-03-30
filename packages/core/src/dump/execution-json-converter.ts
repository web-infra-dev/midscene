import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ScreenshotLike = {
  base64?: unknown;
  capturedAt?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInlineDataUriBase64(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function inferImageExt(dataUri: string): 'png' | 'jpeg' {
  if (dataUri.startsWith('data:image/jpeg')) return 'jpeg';
  if (dataUri.startsWith('data:image/jpg')) return 'jpeg';
  return 'png';
}

function rawBase64FromDataUri(dataUri: string): string {
  return dataUri.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
}

function imageHashFromDataUri(dataUri: string): string {
  return createHash('sha256').update(dataUri).digest('hex');
}

/**
 * Convert execution JSON (inline base64 screenshots) to report-compatible dump:
 * - inline base64 screenshot => { base64: "./screenshots/<hash>.<ext>", capturedAt }
 * - dedupe files by content hash
 */
export function convertExecutionInlineJsonToReportDump(options: {
  serializedExecutionJson: string;
  screenshotsDir: string;
  hashToRelativePath: Map<string, string>;
}): string {
  const { serializedExecutionJson, screenshotsDir, hashToRelativePath } =
    options;

  const parsed = JSON.parse(serializedExecutionJson) as JsonValue;
  if (!existsSync(screenshotsDir)) {
    mkdirSync(screenshotsDir, { recursive: true });
  }

  const visit = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) {
      return value.map((item) => visit(item));
    }

    if (!isObject(value)) {
      return value;
    }

    const maybeScreenshot = value as ScreenshotLike;
    const maybeBase64 = maybeScreenshot.base64;

    if ('$screenshot' in value) {
      throw new Error(
        'Legacy $screenshot format is no longer supported in execution JSON',
      );
    }

    if ('base64' in maybeScreenshot && !isInlineDataUriBase64(maybeBase64)) {
      throw new Error(
        'Expected inline data-uri screenshot base64 in execution JSON',
      );
    }

    if (isInlineDataUriBase64(maybeBase64)) {
      const ext = inferImageExt(maybeBase64);
      const hash = imageHashFromDataUri(maybeBase64);
      let relativePath = hashToRelativePath.get(hash);
      if (!relativePath) {
        const fileName = `${hash}.${ext}`;
        relativePath = `./screenshots/${fileName}`;
        const filePath = join(screenshotsDir, fileName);
        writeFileSync(
          filePath,
          Buffer.from(rawBase64FromDataUri(maybeBase64), 'base64'),
        );
        hashToRelativePath.set(hash, relativePath);
      }
      return {
        ...value,
        base64: relativePath,
      } as JsonValue;
    }

    const next: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value)) {
      next[k] = visit(v as JsonValue);
    }
    return next;
  };

  return JSON.stringify(visit(parsed));
}
