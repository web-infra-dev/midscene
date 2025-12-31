import { antiEscapeScriptTag } from '@midscene/shared/utils';

// Constants matching backend definitions in packages/core/src/utils.ts
const IMAGE_REF_PREFIX = '#midscene-img:';
const IMAGE_SCRIPT_TYPE = 'midscene-image';

/** Map of image ID to base64 data string, loaded from script tags */
type ImageIdToBase64Map = Record<string, string>;

/**
 * Load all image script tags into a map.
 * These are base64 images that were extracted from dump JSON during report generation.
 *
 * @returns Map of image IDs to their base64 data
 */
export function loadImageMap(): ImageIdToBase64Map {
  const scripts = document.querySelectorAll(
    `script[type="${IMAGE_SCRIPT_TYPE}"]`,
  );
  const map: ImageIdToBase64Map = {};

  scripts.forEach((script) => {
    const id = script.getAttribute('data-id');
    if (id && script.textContent) {
      map[id] = antiEscapeScriptTag(script.textContent.trim());
    }
  });

  return map;
}

/**
 * Check if a value is an image reference string.
 */
function isImageReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX);
}

/**
 * Recursively restore image references in parsed data.
 * Replaces references like "#midscene-img:img-0" with the actual base64 data.
 *
 * @param data - The parsed JSON data with image references
 * @param imageMap - Map of image IDs to base64 data
 * @returns Data with image references restored to base64
 */
export function restoreImageReferences<T>(
  data: T,
  imageMap: ImageIdToBase64Map,
): T {
  if (typeof data === 'string') {
    if (isImageReference(data)) {
      const id = data.slice(IMAGE_REF_PREFIX.length);
      const base64 = imageMap[id];
      if (base64) {
        // Type assertion: string is assignable to T when T extends string
        return base64 as T;
      }
      // Return original reference if not found (for debugging)
      const availableIds = Object.keys(imageMap).join(', ') || 'none';
      console.warn(
        `Image not found for reference: ${data}. Available IDs: ${availableIds}`,
      );
      return data;
    }
    return data;
  }

  if (Array.isArray(data)) {
    // Type assertion: array mapping preserves array type
    return data.map((item) => restoreImageReferences(item, imageMap)) as T;
  }

  if (typeof data === 'object' && data !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = restoreImageReferences(value, imageMap);
    }
    // Type assertion: reconstructed object matches original shape
    return result as T;
  }

  return data;
}

export { IMAGE_REF_PREFIX, IMAGE_SCRIPT_TYPE };
