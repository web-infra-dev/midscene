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
 * Check if a value is an image reference string (legacy format).
 */
function isImageReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX);
}

/**
 * Check if a value is a serialized ScreenshotItem: { $screenshot: string }
 * Also handles { $screenshot: undefined } case by returning false
 */
function isSerializedScreenshotItem(
  value: unknown,
): value is { $screenshot: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('$screenshot' in value)) {
    return false;
  }
  const screenshot = (value as { $screenshot: unknown }).$screenshot;
  // Must be a non-empty string
  return typeof screenshot === 'string' && screenshot.length > 0;
}

/**
 * Recursively restore image references in parsed data.
 * Handles both new format { $screenshot: "id" } and legacy format "#midscene-img:id".
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
    // Legacy format: "#midscene-img:id"
    if (isImageReference(data)) {
      const id = data.slice(IMAGE_REF_PREFIX.length);
      const base64 = imageMap[id];
      if (base64) {
        return base64 as T;
      }
      const availableIds = Object.keys(imageMap).join(', ') || 'none';
      console.warn(
        `Image not found for reference: ${data}. Available IDs: ${availableIds}`,
      );
      return data;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => restoreImageReferences(item, imageMap)) as T;
  }

  if (typeof data === 'object' && data !== null) {
    // Handle { $screenshot: ... } format (including empty/undefined values)
    if ('$screenshot' in data) {
      const screenshot = (data as { $screenshot: unknown }).$screenshot;

      // Handle undefined or null
      if (screenshot === undefined || screenshot === null) {
        return '' as T;
      }

      // Handle non-string values
      if (typeof screenshot !== 'string') {
        console.warn('Invalid $screenshot value type:', typeof screenshot);
        return '' as T;
      }

      // Handle empty string
      if (screenshot.length === 0) {
        return '' as T;
      }

      // Check if it's already base64 data
      if (screenshot.startsWith('data:image/')) {
        return screenshot as T;
      }

      // Check if it's a file path (for directory-based reports)
      if (screenshot.startsWith('./') || screenshot.startsWith('/')) {
        return screenshot as T;
      }

      // It's an ID, look up in imageMap
      const base64 = imageMap[screenshot];
      if (base64) {
        return base64 as T;
      }

      // Fallback: return the value as-is (could be a placeholder)
      if (Object.keys(imageMap).length > 0) {
        const availableIds = Object.keys(imageMap).join(', ');
        console.warn(
          `Image not found for ID: ${screenshot}. Available IDs: ${availableIds}`,
        );
      }
      return screenshot as T;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = restoreImageReferences(value, imageMap);
    }
    return result as T;
  }

  return data;
}

export { IMAGE_REF_PREFIX, IMAGE_SCRIPT_TYPE };
