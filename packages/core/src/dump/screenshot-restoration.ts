import {
  type ImageUrlRef,
  type ScreenshotRef,
  type StoredImageRef,
  normalizeImageUrlRef,
  normalizeScreenshotRef,
  reportImageAssetPath,
} from './image-reference';

export type ScreenshotReferenceResolver = (ref: ScreenshotRef) => string;
export type ImageUrlReferenceResolver = (ref: ImageUrlRef) => string;

/**
 * Recursively restore image references in parsed data.
 * Replaces screenshot refs with lazy
 * { get base64() {...}, capturedAt, sourceRef } objects, and reference-image
 * URL refs with their URL strings. Screenshot refs are resolved on first use.
 */
export function restoreImageReferences<T>(
  data: T,
  resolveScreenshot: ScreenshotReferenceResolver,
  resolveImageUrl?: ImageUrlReferenceResolver,
): T {
  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) =>
      restoreImageReferences(item, resolveScreenshot, resolveImageUrl),
    ) as T;
  }

  if (typeof data === 'object' && data !== null) {
    const imageUrlRef = normalizeImageUrlRef(data);
    if (imageUrlRef) {
      if (!resolveImageUrl) {
        throw new Error(
          `A reference-image resolver is required for report image "${imageUrlRef.id}"`,
        );
      }
      return resolveImageUrl(imageUrlRef) as T;
    }

    const refLike = normalizeScreenshotRef(data);
    if (refLike) {
      let resolved: string | null = null;
      const lazy: {
        base64: string;
        capturedAt?: number;
        sourceRef: ScreenshotRef;
      } = Object.defineProperties(
        {} as {
          base64: string;
          capturedAt?: number;
          sourceRef: ScreenshotRef;
        },
        {
          base64: {
            get() {
              if (resolved === null) {
                resolved = resolveScreenshot(refLike);
              }
              return resolved;
            },
            enumerable: true,
          },
          capturedAt: { value: refLike.capturedAt, enumerable: true },
          sourceRef: { value: { ...refLike }, enumerable: true },
        },
      );
      return lazy as T;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = restoreImageReferences(
        value,
        resolveScreenshot,
        resolveImageUrl,
      );
    }
    return result as T;
  }

  return data;
}

/**
 * Restore file-backed report image references to browser-resolvable URLs.
 * Serialized paths are authoritative; legacy inline refs use the standard
 * screenshots directory and the MIME-derived extension.
 */
export function restoreReportImageReferences<T>(data: T, reportUrl: string): T {
  const resolveReportImage = (ref: StoredImageRef): string => {
    return new URL(reportImageAssetPath(ref), reportUrl).toString();
  };
  return restoreImageReferences(data, resolveReportImage, resolveReportImage);
}
