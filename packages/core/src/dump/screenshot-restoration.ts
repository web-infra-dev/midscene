import {
  type ScreenshotRef,
  type StoredImageRef,
  normalizeImageUrlRef,
  normalizeScreenshotRef,
} from './screenshot-store';

/**
 * Recursively restore image references in parsed data.
 * Replaces screenshot refs with lazy
 * { get base64() {...}, capturedAt, sourceRef } objects, and reference-image
 * URL refs with their URL strings. Screenshot refs are resolved on first use.
 */
export function restoreImageReferences<T>(
  data: T,
  resolveImage: (ref: StoredImageRef) => string,
): T {
  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => restoreImageReferences(item, resolveImage)) as T;
  }

  if (typeof data === 'object' && data !== null) {
    const imageUrlRef = normalizeImageUrlRef(data);
    if (imageUrlRef) {
      return resolveImage(imageUrlRef) as T;
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
                resolved = resolveImage(refLike);
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
      result[key] = restoreImageReferences(value, resolveImage);
    }
    return result as T;
  }

  return data;
}
