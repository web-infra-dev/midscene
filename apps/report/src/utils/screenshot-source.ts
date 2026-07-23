import {
  screenshotImageExtension,
  screenshotImageFormatFromMimeType,
} from '@midscene/shared/img/image-format';

export interface ReportScreenshotSourceRef {
  id: string;
  mimeType?: unknown;
  storage?: 'inline' | 'file';
  path?: string;
}

export function resolveScreenshotFallbackPath(
  refOrId: string | ReportScreenshotSourceRef,
): string {
  if (
    typeof refOrId === 'object' &&
    refOrId.storage === 'file' &&
    refOrId.path
  ) {
    return refOrId.path;
  }

  const id = typeof refOrId === 'string' ? refOrId : refOrId.id;
  const format =
    typeof refOrId === 'object'
      ? screenshotImageFormatFromMimeType(refOrId.mimeType)
      : undefined;
  const extension = format ? screenshotImageExtension(format) : 'png';
  return `./screenshots/${id}.${extension}`;
}
