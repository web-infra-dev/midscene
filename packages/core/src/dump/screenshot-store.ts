import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { writeFile as writeFileAsync } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { ScreenshotItem } from '../screenshot-item';
import { collectImageScriptIdsSync, extractImageByIdSync } from './html-utils';

/** Serialized reference to a captured screenshot stored by a report. */
export interface ScreenshotRef {
  type: 'midscene_screenshot_ref';
  id: string;
  capturedAt: number;
  mimeType: 'image/png' | 'image/jpeg';
  storage: 'inline' | 'file';
  path?: string;
}

/** Serialized reference to a multimodal prompt image URL stored by a report. */
export interface ImageUrlRef {
  type: 'midscene_image_url_ref';
  id: string;
  mimeType: `image/${string}`;
  storage: 'inline' | 'file';
  path?: string;
}

/** Any image asset reference supported by report serialization. */
export type StoredImageRef = ScreenshotRef | ImageUrlRef;

const base64ImageDataUrlPattern =
  /^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,([a-z0-9+/=\s]+)$/i;
const knownImageExtensions: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
};

function hasValidStorage(record: Record<string, unknown>): boolean {
  if (record.storage !== 'inline' && record.storage !== 'file') return false;
  return record.storage !== 'file' || typeof record.path === 'string';
}

function hasValidImageId(record: Record<string, unknown>): boolean {
  return (
    typeof record.id === 'string' && /^[a-z0-9_-]{1,128}$/i.test(record.id)
  );
}

export function normalizeScreenshotRef(value: unknown): ScreenshotRef | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  if (
    record.type === 'midscene_screenshot_ref' &&
    hasValidImageId(record) &&
    typeof record.capturedAt === 'number' &&
    (record.storage === 'inline' || record.storage === 'file') &&
    (record.mimeType === 'image/png' || record.mimeType === 'image/jpeg') &&
    hasValidStorage(record)
  ) {
    return record as unknown as ScreenshotRef;
  }

  return null;
}

export function normalizeImageUrlRef(value: unknown): ImageUrlRef | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  if (
    record.type === 'midscene_image_url_ref' &&
    hasValidImageId(record) &&
    typeof record.mimeType === 'string' &&
    record.mimeType.startsWith('image/') &&
    hasValidStorage(record)
  ) {
    return record as unknown as ImageUrlRef;
  }

  return null;
}

export function normalizeStoredImageRef(value: unknown): StoredImageRef | null {
  return normalizeScreenshotRef(value) ?? normalizeImageUrlRef(value);
}

type ResolvedImageSource =
  | {
      type: 'data-uri';
      id: string;
      mimeType: StoredImageRef['mimeType'];
      dataUri: string;
    }
  | {
      type: 'file';
      id: string;
      mimeType: StoredImageRef['mimeType'];
      filePath: string;
    };

function extensionByMimeType(mimeType: ScreenshotRef['mimeType']): string {
  return mimeType === 'image/jpeg' ? 'jpeg' : 'png';
}

function extensionForImageMimeType(mimeType: string): string {
  const knownExtension = knownImageExtensions[mimeType.toLowerCase()];
  if (knownExtension) return knownExtension;

  const subtype = mimeType.slice('image/'.length).split('+', 1)[0];
  const sanitized = subtype
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  if (!sanitized) {
    throw new Error(
      `ReportImageStore: cannot derive a file extension for reference image MIME type "${mimeType}"`,
    );
  }
  return sanitized;
}

export function imageRefFileExtension(ref: StoredImageRef): string {
  return ref.type === 'midscene_image_url_ref'
    ? extensionForImageMimeType(ref.mimeType)
    : extensionByMimeType(ref.mimeType);
}

/** Parse and normalize a base64 image data URL for report persistence. */
export function parseBase64ImageDataUrl(imageUrl: string): {
  mimeType: `image/${string}`;
  extension: string;
  rawBase64: string;
} {
  const match = imageUrl.match(base64ImageDataUrlPattern);
  if (!match) {
    throw new Error(
      'ReportImageStore: reference image must be a valid base64 image data URL',
    );
  }
  const mimeType = match[1].toLowerCase() as `image/${string}`;
  return {
    mimeType,
    extension: extensionForImageMimeType(mimeType),
    rawBase64: match[2].replace(/\s/g, ''),
  };
}

export function isBase64ImageDataUrl(value: string): boolean {
  return base64ImageDataUrlPattern.test(value);
}

export function resolveImageSource(
  refInput: unknown,
  options: {
    reportPath: string;
    fallbackId?: string;
    fallbackMimeType?: ScreenshotRef['mimeType'];
  },
): ResolvedImageSource {
  const ref = normalizeStoredImageRef(refInput);
  const id = ref?.id ?? options.fallbackId;
  const mimeType = ref?.mimeType ?? options.fallbackMimeType;

  if (!id || !mimeType) {
    throw new Error(
      'ReportImageStore: image id and mimeType are required to resolve an image',
    );
  }

  const resolveReportRelativePath = (filePath: string): string =>
    isAbsolute(filePath)
      ? filePath
      : join(dirname(options.reportPath), filePath);

  if (ref?.storage === 'file') {
    if (!ref.path) {
      throw new Error(
        `ReportImageStore: image ref "${ref.id}" missing file path`,
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

  const extension = ref
    ? imageRefFileExtension(ref)
    : extensionByMimeType(options.fallbackMimeType!);
  const siblingImagePath = join(
    dirname(options.reportPath),
    'screenshots',
    `${id}.${extension}`,
  );
  if (existsSync(siblingImagePath)) {
    return {
      type: 'file',
      id,
      mimeType,
      filePath: siblingImagePath,
    };
  }

  throw new Error(
    `ReportImageStore: cannot resolve image "${id}" from ${options.reportPath}`,
  );
}

export function resolveScreenshotSource(
  refInput: unknown,
  options: {
    reportPath: string;
    fallbackId?: string;
    fallbackMimeType?: ScreenshotRef['mimeType'];
  },
): ResolvedImageSource {
  const ref = normalizeScreenshotRef(refInput);
  return resolveImageSource(ref, options);
}

/** Persists and restores every image asset referenced by a report. */
export class ReportImageStore {
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
  private readonly referenceImageRefsByUrl = new Map<string, ImageUrlRef>();

  constructor(options: {
    mode: 'inline' | 'directory';
    reportPath: string;
    screenshotsDir?: string;
    writeInlineImage?: (id: string, base64: string) => void | Promise<void>;
    alsoWriteFileCopy?: boolean;
    /** @deprecated Use alsoWriteFileCopy instead. */
    ensureFileCopy?: boolean;
    /** Reuse inline image assets already present in reportPath. */
    reuseExistingReport?: boolean;
  }) {
    this.mode = options.mode;
    this.reportPath = options.reportPath;
    this.screenshotsDir = options.screenshotsDir;
    this.writeInlineImage = options.writeInlineImage;
    this.alsoWriteFileCopy =
      options.alsoWriteFileCopy ?? options.ensureFileCopy ?? false;
    if (
      options.reuseExistingReport &&
      this.mode === 'inline' &&
      existsSync(this.reportPath)
    ) {
      for (const imageId of collectImageScriptIdsSync(this.reportPath)) {
        this.writtenInlineIds.add(imageId);
      }
    }
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
          'ReportImageStore: writeInlineImage is required in inline mode',
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
        'ReportImageStore: file persistence is required in directory mode',
      );
    }
    return fileRef;
  }

  /** Persist a base64 multimodal prompt image and return its content-addressed ref. */
  async persistReferenceImage(imageUrl: string): Promise<ImageUrlRef> {
    const cachedRef = this.referenceImageRefsByUrl.get(imageUrl);
    if (cachedRef) return cachedRef;

    const { mimeType, extension, rawBase64 } =
      parseBase64ImageDataUrl(imageUrl);
    const id = `reference-${createHash('sha256')
      .update(mimeType)
      .update('\0')
      .update(Buffer.from(rawBase64, 'base64'))
      .digest('hex')}`;
    const shouldWriteFileCopy =
      this.mode === 'directory' || this.alsoWriteFileCopy;
    const fileLocation = shouldWriteFileCopy
      ? await this.writeImageFileIfNeeded({ id, extension, rawBase64 })
      : null;

    let ref: ImageUrlRef;
    if (this.mode === 'inline') {
      if (!this.writeInlineImage) {
        throw new Error(
          'ReportImageStore: writeInlineImage is required in inline mode',
        );
      }
      if (!this.writtenInlineIds.has(id)) {
        await this.writeInlineImage(id, imageUrl);
        this.writtenInlineIds.add(id);
      }
      ref = {
        type: 'midscene_image_url_ref',
        id,
        mimeType,
        storage: 'inline',
      };
    } else {
      if (!fileLocation) {
        throw new Error(
          'ReportImageStore: file persistence is required in directory mode',
        );
      }
      ref = {
        type: 'midscene_image_url_ref',
        id,
        mimeType,
        storage: 'file',
        path: fileLocation.relativePath,
      };
    }
    this.referenceImageRefsByUrl.set(imageUrl, ref);
    return ref;
  }

  private async persistToSharedFileIfNeeded(
    screenshot: ScreenshotItem,
    options: {
      markAsPersisted: boolean;
    },
  ): Promise<ScreenshotRef> {
    const { relativePath, absolutePath } = await this.writeImageFileIfNeeded({
      id: screenshot.id,
      extension: screenshot.extension,
      rawBase64: screenshot.rawBase64,
    });

    if (options.markAsPersisted) {
      return screenshot.markPersistedToPath(relativePath, absolutePath);
    }

    return screenshot.registerPersistedFileCopy(relativePath, absolutePath);
  }

  private async writeImageFileIfNeeded(image: {
    id: string;
    extension: string;
    rawBase64: string;
  }): Promise<{ relativePath: string; absolutePath: string }> {
    const screenshotsDir = this.screenshotsDir;
    if (!screenshotsDir) {
      throw new Error(
        'ReportImageStore: screenshotsDir is required when file persistence is enabled',
      );
    }
    if (!existsSync(screenshotsDir)) {
      mkdirSync(screenshotsDir, { recursive: true });
    }

    const fileName = `${image.id}.${image.extension}`;
    const relativePath = `./screenshots/${fileName}`;
    const absolutePath = join(screenshotsDir, fileName);
    if (!this.writtenFileIds.has(image.id)) {
      await writeFileAsync(
        absolutePath,
        Buffer.from(image.rawBase64, 'base64'),
      );
      this.writtenFileIds.add(image.id);
    }
    return { relativePath, absolutePath };
  }

  loadBase64(refInput: unknown): string {
    const ref = normalizeScreenshotRef(refInput);
    if (!ref) {
      throw new Error('ReportImageStore: invalid screenshot reference');
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
    this.referenceImageRefsByUrl.clear();
  }
}

/** @deprecated Use ReportImageStore. */
export { ReportImageStore as ScreenshotStore };
