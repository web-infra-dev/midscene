import {
  type ScreenshotRef,
  normalizeScreenshotRef,
} from '../screenshot-store';

/**
 * Recursively restore image references in parsed data.
 * Replaces ScreenshotRef (and legacy screenshot formats) with lazy
 * { get base64() {...}, capturedAt } objects.
 * The resolver is only called when .base64 is first accessed.
 */
export function restoreImageReferences<T>(
  data: T,
  resolveImage: (ref: ScreenshotRef) => string,
): T {
  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => restoreImageReferences(item, resolveImage)) as T;
  }

  if (typeof data === 'object' && data !== null) {
    const refLike = normalizeScreenshotRef(data);
    if (refLike) {
      if ('base64' in refLike) {
        return {
          base64: refLike.base64,
          capturedAt: refLike.capturedAt,
        } as T;
      }
      const normalizedRef: ScreenshotRef =
        'type' in refLike
          ? refLike
          : '$screenshot' in refLike
            ? {
                type: 'midscene_screenshot_ref',
                id: refLike.$screenshot,
                capturedAt: refLike.capturedAt ?? 0,
                mimeType: 'image/png',
                storage: 'inline',
              }
            : {
                type: 'midscene_screenshot_ref',
                id: refLike.base64,
                capturedAt: refLike.capturedAt ?? 0,
                mimeType:
                  refLike.base64.endsWith('.jpeg') ||
                  refLike.base64.endsWith('.jpg')
                    ? 'image/jpeg'
                    : 'image/png',
                storage: 'file',
                path: refLike.base64,
              };

      let resolved: string | null = null;
      const lazy: { base64: string; capturedAt?: number } =
        Object.defineProperties({} as { base64: string; capturedAt?: number }, {
          base64: {
            get() {
              if (resolved === null) {
                resolved = resolveImage(normalizedRef);
              }
              return resolved;
            },
            enumerable: true,
          },
          capturedAt: { value: normalizedRef.capturedAt, enumerable: true },
        });
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
