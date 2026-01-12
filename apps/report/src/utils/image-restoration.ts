import { restoreImageReferences } from '@midscene/core';
import { antiEscapeScriptTag } from '@midscene/shared/utils';

// Constants matching backend definitions in packages/core/src/dump/html-utils.ts
const IMAGE_SCRIPT_TYPE = 'midscene-image';

/** Map of image ID to base64 data string, loaded from script tags */
type ImageIdToBase64Map = Record<string, string>;

/**
 * Load all image script tags into a map.
 * These are base64 images that were extracted from dump JSON during report generation.
 * This function is DOM-specific and cannot be moved to @midscene/core.
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

// Re-export restoreImageReferences from @midscene/core for convenience
export { restoreImageReferences, IMAGE_SCRIPT_TYPE };
