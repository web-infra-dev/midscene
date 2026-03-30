import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
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

export function normalizeScreenshotRef(value: unknown): ScreenshotRef | null {
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
    return `data:${ref.mimeType};base64,${data.toString('base64')}`;
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
