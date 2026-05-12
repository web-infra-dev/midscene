import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { writeFile as writeFileAsync } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { ScreenshotItem } from '../screenshot-item';
import { extractImageByIdSync } from './html-utils';

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

type ResolvedScreenshotSource =
  | {
      type: 'data-uri';
      id: string;
      mimeType: ScreenshotRef['mimeType'];
      dataUri: string;
    }
  | {
      type: 'file';
      id: string;
      mimeType: ScreenshotRef['mimeType'];
      filePath: string;
    };

function extensionByMimeType(mimeType: ScreenshotRef['mimeType']): string {
  return mimeType === 'image/jpeg' ? 'jpeg' : 'png';
}

export function resolveScreenshotSource(
  refInput: unknown,
  options: {
    reportPath: string;
    fallbackId?: string;
    fallbackMimeType?: ScreenshotRef['mimeType'];
  },
): ResolvedScreenshotSource {
  const ref = normalizeScreenshotRef(refInput);
  const id = ref?.id ?? options.fallbackId;
  const mimeType = ref?.mimeType ?? options.fallbackMimeType;

  if (!id || !mimeType) {
    throw new Error(
      'ScreenshotStore: screenshot id and mimeType are required to resolve screenshot',
    );
  }

  const resolveReportRelativePath = (filePath: string): string =>
    isAbsolute(filePath)
      ? filePath
      : join(dirname(options.reportPath), filePath);

  if (ref?.storage === 'file') {
    if (!ref.path) {
      throw new Error(
        `ScreenshotStore: screenshot ref "${ref.id}" missing file path`,
      );
    }

    const explicitFilePath = resolveReportRelativePath(ref.path);
    if (existsSync(explicitFilePath)) {
      return {
        type: 'file',
        id,
        mimeType,
        filePath: explicitFilePath,
      };
    }
  }

  const inlineDataUri = extractImageByIdSync(options.reportPath, id);
  if (inlineDataUri) {
    return {
      type: 'data-uri',
      id,
      mimeType,
      dataUri: inlineDataUri,
    };
  }

  const siblingScreenshotPath = join(
    dirname(options.reportPath),
    'screenshots',
    `${id}.${extensionByMimeType(mimeType)}`,
  );
  if (existsSync(siblingScreenshotPath)) {
    return {
      type: 'file',
      id,
      mimeType,
      filePath: siblingScreenshotPath,
    };
  }

  throw new Error(
    `ScreenshotStore: cannot resolve screenshot "${id}" from ${options.reportPath}`,
  );
}

export class ScreenshotStore {
  private readonly mode: 'inline' | 'directory';
  private readonly reportPath: string;
  private readonly screenshotsDir?: string;
  private readonly writeInlineImage?: (
    id: string,
    base64: string,
  ) => void | Promise<void>;
  private readonly alsoWriteFileCopy: boolean;
  private readonly writtenInlineIds = new Set<string>();
  private readonly writtenFileIds = new Set<string>();

  constructor(options: {
    mode: 'inline' | 'directory';
    reportPath: string;
    screenshotsDir?: string;
    writeInlineImage?: (id: string, base64: string) => void | Promise<void>;
    alsoWriteFileCopy?: boolean;
    /** @deprecated Use alsoWriteFileCopy instead. */
    ensureFileCopy?: boolean;
  }) {
    this.mode = options.mode;
    this.reportPath = options.reportPath;
    this.screenshotsDir = options.screenshotsDir;
    this.writeInlineImage = options.writeInlineImage;
    this.alsoWriteFileCopy =
      options.alsoWriteFileCopy ?? options.ensureFileCopy ?? false;
  }

  async persist(screenshot: ScreenshotItem): Promise<ScreenshotRef> {
    const shouldWriteFileCopy =
      this.mode === 'directory' || this.alsoWriteFileCopy;
    const fileRef = shouldWriteFileCopy
      ? await this.persistToSharedFileIfNeeded(screenshot, {
          markAsPersisted: this.mode === 'directory',
        })
      : null;

    if (this.mode === 'inline') {
      if (!this.writeInlineImage) {
        throw new Error(
          'ScreenshotStore: writeInlineImage is required in inline mode',
        );
      }
      if (!this.writtenInlineIds.has(screenshot.id)) {
        await this.writeInlineImage(screenshot.id, screenshot.base64);
        this.writtenInlineIds.add(screenshot.id);
      }
      return screenshot.markPersistedInline(this.reportPath);
    }

    if (!fileRef) {
      throw new Error(
        'ScreenshotStore: file persistence is required in directory mode',
      );
    }
    return fileRef;
  }

  private async persistToSharedFileIfNeeded(
    screenshot: ScreenshotItem,
    options: {
      markAsPersisted: boolean;
    },
  ): Promise<ScreenshotRef> {
    const screenshotsDir = this.screenshotsDir;
    if (!screenshotsDir) {
      throw new Error(
        'ScreenshotStore: screenshotsDir is required when file persistence is enabled',
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

    if (!this.writtenFileIds.has(screenshot.id)) {
      const buffer = Buffer.from(screenshot.rawBase64, 'base64');
      await writeFileAsync(absolutePath, buffer);
      this.writtenFileIds.add(screenshot.id);
    }

    if (options.markAsPersisted) {
      return screenshot.markPersistedToPath(relativePath, absolutePath);
    }

    return screenshot.registerPersistedFileCopy(relativePath, absolutePath);
  }

  loadBase64(refInput: unknown): string {
    const ref = normalizeScreenshotRef(refInput);
    if (!ref) {
      throw new Error('ScreenshotStore: invalid screenshot reference');
    }

    const resolved = resolveScreenshotSource(ref, {
      reportPath: this.reportPath,
    });

    if (resolved.type === 'data-uri') {
      return resolved.dataUri;
    }

    const data = readFileSync(resolved.filePath);
    return `data:${resolved.mimeType};base64,${data.toString('base64')}`;
  }

  cleanup(): void {
    if (
      this.mode === 'directory' &&
      this.screenshotsDir &&
      existsSync(this.screenshotsDir)
    ) {
      rmSync(this.screenshotsDir, { recursive: true, force: true });
    }
    this.writtenInlineIds.clear();
    this.writtenFileIds.clear();
  }
}
