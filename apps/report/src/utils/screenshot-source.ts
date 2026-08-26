import {
  type StoredImageRef,
  imageFileExtensionForMimeType,
} from '@midscene/core/dump';

export function resolveScreenshotFallbackPath(ref: StoredImageRef): string {
  if (ref.storage === 'file' && ref.path) {
    return ref.path;
  }

  return `./screenshots/${ref.id}.${imageFileExtensionForMimeType(ref.mimeType)}`;
}
