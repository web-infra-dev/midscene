/**
 * Restore a screenshot value to base64 or file path.
 * Handles: base64 data, file paths, or IDs that need lookup.
 */
function restoreScreenshotValue(
  screenshot: unknown,
  imageMap: Record<string, string>,
): string {
  if (screenshot === undefined || screenshot === null) {
    return '';
  }

  if (typeof screenshot !== 'string') {
    console.warn('Invalid $screenshot value type:', typeof screenshot);
    return '';
  }

  if (screenshot.length === 0) {
    return '';
  }

  // Already base64 data or file path
  if (
    screenshot.startsWith('data:image/') ||
    screenshot.startsWith('./') ||
    screenshot.startsWith('/')
  ) {
    return screenshot;
  }

  // Look up ID in imageMap
  const base64 = imageMap[screenshot];
  if (base64) {
    return base64;
  }

  const availableIds = Object.keys(imageMap);
  if (availableIds.length > 0) {
    console.warn(
      `Image not found for ID: ${screenshot}. Available IDs: ${availableIds.join(', ')}`,
    );
  }
  return screenshot;
}

/**
 * Recursively restore image references in parsed data.
 * Replaces { $screenshot: "id" } with base64 values from imageMap.
 * Used by Playground and Extension to render images.
 */
export function restoreImageReferences<T>(
  data: T,
  imageMap: Record<string, string>,
): T {
  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => restoreImageReferences(item, imageMap)) as T;
  }

  if (typeof data === 'object' && data !== null) {
    if ('$screenshot' in data) {
      const screenshot = (data as { $screenshot: unknown }).$screenshot;
      return restoreScreenshotValue(screenshot, imageMap) as T;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = restoreImageReferences(value, imageMap);
    }
    return result as T;
  }

  return data;
}
