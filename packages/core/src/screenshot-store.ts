import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { extractImageByIdSync } from './dump/html-utils';
import type { ScreenshotItem } from './screenshot-item';

export interface ScreenshotRef {
  type: 'midscene_screenshot_ref';
  id: string;
  capturedAt: number;
  mimeType: 'image/png' | 'image/jpeg';
  storage: 'inline' | 'file';
  path?: string;
}

type LegacyScreenshotRef =
  | { $screenshot: string; capturedAt?: number }
  | { base64: string; capturedAt?: number };

type ScreenshotRefLike = ScreenshotRef | LegacyScreenshotRef;

function mimeTypeFromPath(filePath: string): 'image/png' | 'image/jpeg' {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'image/png';
}

export function normalizeScreenshotRef(
  value: unknown,
): ScreenshotRefLike | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  if (
    record.type === 'midscene_screenshot_ref' &&
    typeof record.id === 'string' &&
    typeof record.capturedAt === 'number' &&
    (record.storage === 'inline' || record.storage === 'file') &&
    (record.mimeType === 'image/png' || record.mimeType === 'image/jpeg')
  ) {
    if (record.storage === 'file' && typeof record.path !== 'string') {
      return null;
    }
    return record as unknown as ScreenshotRef;
  }

  if (typeof record.$screenshot === 'string') {
    return {
      $screenshot: record.$screenshot,
      capturedAt:
        typeof record.capturedAt === 'number' ? record.capturedAt : undefined,
    };
  }

  if (typeof record.base64 === 'string') {
    return {
      base64: record.base64,
      capturedAt:
        typeof record.capturedAt === 'number' ? record.capturedAt : undefined,
    };
  }

  return null;
}

export class ScreenshotStore {
  private readonly mode: 'inline' | 'directory';
  private readonly reportPath: string;
  private readonly screenshotsDir?: string;
  private readonly writeInlineImage?: (id: string, base64: string) => void;
  private readonly writtenIds = new Set<string>();

  constructor(options: {
    mode: 'inline' | 'directory';
    reportPath: string;
    screenshotsDir?: string;
    writeInlineImage?: (id: string, base64: string) => void;
  }) {
    this.mode = options.mode;
    this.reportPath = options.reportPath;
    this.screenshotsDir = options.screenshotsDir;
    this.writeInlineImage = options.writeInlineImage;
  }

  persist(screenshot: ScreenshotItem): ScreenshotRef {
    if (this.mode === 'inline') {
      if (!this.writeInlineImage) {
        throw new Error(
          'ScreenshotStore: writeInlineImage is required in inline mode',
        );
      }
      if (!this.writtenIds.has(screenshot.id)) {
        this.writeInlineImage(screenshot.id, screenshot.base64);
        this.writtenIds.add(screenshot.id);
      }
      return screenshot.markPersistedInline(this.reportPath);
    }

    const screenshotsDir = this.screenshotsDir;
    if (!screenshotsDir) {
      throw new Error(
        'ScreenshotStore: screenshotsDir is required in directory mode',
      );
    }
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    const relativePath = `./screenshots/${screenshot.id}.${screenshot.extension}`;
    const absolutePath = join(
      screenshotsDir,
      `${screenshot.id}.${screenshot.extension}`,
    );

    if (!this.writtenIds.has(screenshot.id)) {
      const buffer = Buffer.from(screenshot.rawBase64, 'base64');
      writeFileSync(absolutePath, buffer);
      this.writtenIds.add(screenshot.id);
    }

    return screenshot.markPersistedToPath(relativePath, absolutePath);
  }

  loadBase64(refInput: unknown): string {
    const ref = normalizeScreenshotRef(refInput);
    if (!ref) {
      throw new Error('ScreenshotStore: invalid screenshot reference');
    }

    if ('type' in ref) {
      if (ref.storage === 'inline') {
        const result = extractImageByIdSync(this.reportPath, ref.id);
        if (!result) {
          throw new Error(
            `ScreenshotStore: cannot resolve inline screenshot "${ref.id}" from ${this.reportPath}`,
          );
        }
        return result;
      }

      const expectedPath = ref.path;
      if (!expectedPath) {
        throw new Error(
          `ScreenshotStore: screenshot ref "${ref.id}" missing file path`,
        );
      }
      const absolute = join(dirname(this.reportPath), expectedPath);
      const data = readFileSync(absolute);
      const mimeType = ref.mimeType;
      return `data:${mimeType};base64,${data.toString('base64')}`;
    }

    // Legacy compatibility read path
    if ('$screenshot' in ref) {
      const result = extractImageByIdSync(this.reportPath, ref.$screenshot);
      if (!result) {
        throw new Error(
          `ScreenshotStore: cannot resolve legacy screenshot "${ref.$screenshot}" from ${this.reportPath}`,
        );
      }
      return result;
    }

    if (ref.base64.startsWith('data:image/')) {
      return ref.base64;
    }

    const absolute = join(dirname(this.reportPath), ref.base64);
    const mimeType = mimeTypeFromPath(ref.base64);
    const data = readFileSync(absolute);
    return `data:${mimeType};base64,${data.toString('base64')}`;
  }

  cleanup(): void {
    if (
      this.mode === 'directory' &&
      this.screenshotsDir &&
      existsSync(this.screenshotsDir)
    ) {
      rmSync(this.screenshotsDir, { recursive: true, force: true });
    }
    this.writtenIds.clear();
  }
}

export function screenshotRefFromLegacy(
  value: LegacyScreenshotRef,
): ScreenshotRef {
  if ('$screenshot' in value) {
    return {
      type: 'midscene_screenshot_ref',
      id: value.$screenshot,
      capturedAt: value.capturedAt ?? 0,
      mimeType: 'image/png',
      storage: 'inline',
    };
  }

  if (
    value.base64.startsWith('data:image/jpeg') ||
    value.base64.startsWith('data:image/jpg')
  ) {
    return {
      type: 'midscene_screenshot_ref',
      id: `legacy-inline-jpeg-${basename(value.base64)}`,
      capturedAt: value.capturedAt ?? 0,
      mimeType: 'image/jpeg',
      storage: 'inline',
    };
  }

  if (value.base64.startsWith('data:image/')) {
    return {
      type: 'midscene_screenshot_ref',
      id: `legacy-inline-png-${basename(value.base64)}`,
      capturedAt: value.capturedAt ?? 0,
      mimeType: 'image/png',
      storage: 'inline',
    };
  }

  return {
    type: 'midscene_screenshot_ref',
    id: basename(value.base64, extname(value.base64)) || 'legacy-file',
    capturedAt: value.capturedAt ?? 0,
    mimeType: mimeTypeFromPath(value.base64),
    storage: 'file',
    path: value.base64,
  };
}
