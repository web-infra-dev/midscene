export const OMITTED_SCREENSHOT_BASE64_TEXT = '[omitted screenshot base64]';

function isScreenshotPath(path: string[]): boolean {
  return path.some((segment) => segment.toLowerCase().includes('screenshot'));
}

export function sanitizeJsonViewData(
  value: unknown,
  path: string[] = [],
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('data:image/') && isScreenshotPath(path)) {
      return OMITTED_SCREENSHOT_BASE64_TEXT;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      sanitizeJsonViewData(item, [...path, String(index)], seen),
    );
  }

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    const result: Record<string, unknown> = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      const nextPath = [...path, key];
      if (key === 'base64' && isScreenshotPath(path)) {
        continue;
      }

      let fieldValue: unknown;
      if ('value' in descriptor) {
        fieldValue = descriptor.value;
      } else if (descriptor.get) {
        fieldValue = descriptor.get.call(value);
      } else {
        continue;
      }

      result[key] = sanitizeJsonViewData(fieldValue, nextPath, seen);
    }

    seen.delete(value);
    return result;
  }

  return value;
}
