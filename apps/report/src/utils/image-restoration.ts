import { antiEscapeScriptTag } from '@midscene/shared/utils';

// Constants matching backend definitions
const IMAGE_REF_PREFIX = '#midscene-img:';
const IMAGE_SCRIPT_TYPE = 'midscene-image';

type ImageMap = Record<string, string>;

/**
 * Load all image script tags into a map.
 * These are base64 images that were extracted from dump JSON during report generation.
 */
export function loadImageMap(): ImageMap {
  const scripts = document.querySelectorAll(
    `script[type="${IMAGE_SCRIPT_TYPE}"]`,
  );
  const map: ImageMap = {};

  scripts.forEach((script) => {
    const id = script.getAttribute('data-id');
    if (id && script.textContent) {
      map[id] = antiEscapeScriptTag(script.textContent.trim());
    }
  });

  return map;
}

/**
 * Check if a value is an image reference.
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
export function restoreImageReferences<T>(data: T, imageMap: ImageMap): T {
  if (typeof data === 'string') {
    if (isImageReference(data)) {
      const id = data.slice(IMAGE_REF_PREFIX.length);
      const base64 = imageMap[id];
      if (base64) {
        return base64 as T;
      }
      // Return original reference if not found (for debugging)
      console.warn(`Image not found for reference: ${data}`);
      return data;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => restoreImageReferences(item, imageMap)) as T;
  }

  if (typeof data === 'object' && data !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = restoreImageReferences(value, imageMap);
    }
    return result as T;
  }

  return data;
}

export { IMAGE_REF_PREFIX, IMAGE_SCRIPT_TYPE };
