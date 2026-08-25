import {
  type ScreenshotRef,
  type StoredImageRef,
  normalizeImageUrlRef,
  normalizeScreenshotRef,
  reportImageAssetPath,
} from './image-reference';

export type StoredImageReferenceResolver = (ref: StoredImageRef) => string;

export interface RestoredScreenshotReference {
  readonly base64: string;
  readonly capturedAt?: number;
  readonly sourceRef: ScreenshotRef;
}

/** Create a resolver that fails loudly when an inline report asset is absent. */
export function createInlineImageResolver(
  images: Readonly<Record<string, string>>,
): StoredImageReferenceResolver {
  return (ref) => {
    const image = images[ref.id];
    if (!image) {
      throw new Error(`Missing inline report image "${ref.id}"`);
    }
    return image;
  };
}

/**
 * Recursively restore image references in parsed data.
 * Replaces screenshot refs with lazy
 * { get base64() {...}, capturedAt, sourceRef } objects, and reference-image
 * URL refs with their URL strings. Screenshot refs are resolved on first use.
 */
export function restoreImageReferences(
  data: unknown,
  resolveImage: StoredImageReferenceResolver,
): unknown {
  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => restoreImageReferences(item, resolveImage));
  }

  if (typeof data === 'object' && data !== null) {
    const imageUrlRef = normalizeImageUrlRef(data);
    if (imageUrlRef) {
      return resolveImage(imageUrlRef);
    }

    const refLike = normalizeScreenshotRef(data);
    if (refLike) {
      let resolved: string | null = null;
      const lazy: RestoredScreenshotReference = Object.defineProperties(
        {} as RestoredScreenshotReference,
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
      return lazy;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = restoreImageReferences(value, resolveImage);
    }
    return result;
  }

  return data;
}

/**
 * Restore file-backed report image references to browser-resolvable URLs.
 * Serialized paths are authoritative; legacy inline refs use the standard
 * screenshots directory and the MIME-derived extension.
 */
export function restoreReportImageReferences(
  data: unknown,
  reportUrl: string,
): unknown {
  const resolveReportImage = (ref: StoredImageRef): string => {
    return new URL(reportImageAssetPath(ref), reportUrl).toString();
  };
  return restoreImageReferences(data, resolveReportImage);
}
