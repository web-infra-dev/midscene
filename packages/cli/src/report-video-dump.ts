function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsFileStoredScreenshotRef(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsFileStoredScreenshotRef);
  }

  if (!isRecord(value)) {
    return false;
  }

  if (value.storage === 'file' && typeof value.id === 'string') {
    return true;
  }

  return Object.values(value).some(containsFileStoredScreenshotRef);
}

export function dumpJsonReferencesFileStoredScreenshots(
  dumpString: string,
): boolean {
  try {
    return containsFileStoredScreenshotRef(JSON.parse(dumpString));
  } catch {
    // Keep the warning best-effort. The actual JSON/template error is reported
    // by the normal report generation path below.
    return /"storage"\s*:\s*"file"/.test(dumpString);
  }
}
