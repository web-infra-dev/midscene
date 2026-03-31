import { type ScreenshotRef, normalizeScreenshotRef } from './screenshot-store';

/**
 * Recursively restore image references in parsed data.
 * Replaces ScreenshotRef with lazy
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
      let resolved: string | null = null;
      const lazy: { base64: string; capturedAt?: number } =
        Object.defineProperties({} as { base64: string; capturedAt?: number }, {
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
