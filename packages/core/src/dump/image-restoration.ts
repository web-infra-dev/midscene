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
      const screenshotData = data as {
        $screenshot: unknown;
        capturedAt?: unknown;
      };
      const id = screenshotData.$screenshot;
      const capturedAt =
        typeof screenshotData.capturedAt === 'number'
          ? screenshotData.capturedAt
          : undefined;
      if (typeof id === 'string') {
        // If found in imageMap, use it (inline mode)
        if (imageMap[id]) {
          return { base64: imageMap[id], capturedAt } as T;
        }
        // If id looks like a path or base64 data, use it directly
        if (
          id.startsWith('data:image/') ||
          id.startsWith('./') ||
          id.startsWith('/')
        ) {
          return { base64: id, capturedAt } as T;
        }
        // Fallback to directory path (directory mode)
        return { base64: `./screenshots/${id}.png`, capturedAt } as T;
      }
      // Invalid $screenshot value, return empty
      console.warn('Invalid $screenshot value type:', typeof id);
      return { base64: '' } as T;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = restoreImageReferences(value, imageMap);
    }
    return result as T;
  }

  return data;
}
