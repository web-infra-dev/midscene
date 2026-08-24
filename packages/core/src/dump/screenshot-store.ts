import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { writeFile as writeFileAsync } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { ScreenshotItem } from '../screenshot-item';
import { collectImageScriptIds, extractImageByIdSync } from './html-utils';
import {
  type ImageUrlRef,
  type ScreenshotRef,
  type StoredImageRef,
  imageFileExtensionForMimeType,
  imageRefFileExtension,
  normalizeImageUrlRef,
  normalizeScreenshotRef,
  normalizeStoredImageRef,
} from './image-reference';

export type {
  ImageUrlRef,
  ScreenshotRef,
  StoredImageRef,
} from './image-reference';
export {
  imageRefFileExtension,
  normalizeImageUrlRef,
  normalizeScreenshotRef,
  normalizeStoredImageRef,
} from './image-reference';

const base64ImageDataUrlPattern =
  /^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,([a-z0-9+/=\s]+)$/i;
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
    extension: imageFileExtensionForMimeType(mimeType),
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
    imageDirectory?: string;
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
    : imageFileExtensionForMimeType(options.fallbackMimeType!);
  if (options.imageDirectory) {
    const companionImagePath = join(
      options.imageDirectory,
      `${id}.${extension}`,
    );
    if (existsSync(companionImagePath)) {
      return {
        type: 'file',
        id,
        mimeType,
        filePath: companionImagePath,
      };
    }
  }
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
    imageDirectory?: string;
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
  private readonly shouldReuseExistingInlineReport: boolean;
  private existingInlineImageIdsPromise?: Promise<void>;

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
    this.shouldReuseExistingInlineReport = Boolean(
      options.reuseExistingReport && this.mode === 'inline',
    );
  }

  async persist(screenshot: ScreenshotItem): Promise<ScreenshotRef> {
    await this.ensureExistingInlineImageIdsLoaded();
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
    await this.ensureExistingInlineImageIdsLoaded();
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

  private async ensureExistingInlineImageIdsLoaded(): Promise<void> {
    if (!this.shouldReuseExistingInlineReport) return;
    if (!this.existingInlineImageIdsPromise) {
      this.existingInlineImageIdsPromise = (async () => {
        try {
          const imageIds = await collectImageScriptIds(this.reportPath);
          for (const imageId of imageIds) this.writtenInlineIds.add(imageId);
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'ENOENT'
          ) {
            return;
          }
          throw new Error(
            `ReportImageStore: failed to index existing inline images from ${this.reportPath}`,
            { cause: error },
          );
        }
      })();
    }
    await this.existingInlineImageIdsPromise;
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

  /** Resolve any stored report image reference to a data URI. */
  loadDataUri(refInput: unknown): string {
    const ref = normalizeStoredImageRef(refInput);
    if (!ref) {
      throw new Error('ReportImageStore: invalid image reference');
    }

    const resolved = resolveImageSource(ref, {
      reportPath: this.reportPath,
      imageDirectory: this.screenshotsDir,
    });

    if (resolved.type === 'data-uri') {
      return resolved.dataUri;
    }

    const data = readFileSync(resolved.filePath);
    return `data:${resolved.mimeType};base64,${data.toString('base64')}`;
  }

  /** @deprecated Use loadDataUri. */
  loadBase64(refInput: unknown): string {
    const screenshotRef = normalizeScreenshotRef(refInput);
    if (!screenshotRef) {
      throw new Error('ReportImageStore: invalid screenshot reference');
    }
    return this.loadDataUri(screenshotRef);
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
    this.existingInlineImageIdsPromise = undefined;
  }
}

/** @deprecated Use ReportImageStore. */
export { ReportImageStore as ScreenshotStore };
