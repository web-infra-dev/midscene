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

const knownImageMimeTypesByExtension: Readonly<
  Record<string, `image/${string}`>
> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
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

/** Validate and normalize a serialized screenshot reference. */
export function normalizeScreenshotRef(value: unknown): ScreenshotRef | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  if (
    record.type === 'midscene_screenshot_ref' &&
    hasValidImageId(record) &&
    typeof record.capturedAt === 'number' &&
    (record.mimeType === 'image/png' || record.mimeType === 'image/jpeg') &&
    hasValidStorage(record)
  ) {
    return record as unknown as ScreenshotRef;
  }

  return null;
}

/** Validate and normalize a serialized multimodal prompt image reference. */
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

/** Validate any serialized report image reference. */
export function normalizeStoredImageRef(value: unknown): StoredImageRef | null {
  return normalizeScreenshotRef(value) ?? normalizeImageUrlRef(value);
}

/** Resolve the report asset extension for an image MIME type. */
export function imageFileExtensionForMimeType(mimeType: string): string {
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
      `Cannot derive a report image file extension for MIME type "${mimeType}"`,
    );
  }
  return sanitized;
}

/** Resolve a supported report image MIME type from its file extension. */
export function imageMimeTypeForFileExtension(
  extension: string,
): `image/${string}` | null {
  return knownImageMimeTypesByExtension[extension.toLowerCase()] ?? null;
}

/** Resolve the file extension used by a serialized report image reference. */
export function imageRefFileExtension(ref: StoredImageRef): string {
  return imageFileExtensionForMimeType(ref.mimeType);
}

/**
 * Resolve the report-relative asset path for an image reference.
 * Explicit serialized paths win; inline refs use the standard screenshots dir.
 */
export function reportImageAssetPath(ref: StoredImageRef): string {
  if (ref.storage === 'file' && ref.path) return ref.path;
  return `./screenshots/${encodeURIComponent(ref.id)}.${imageRefFileExtension(ref)}`;
}
