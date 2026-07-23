function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isTransientAdbTransportError(error: unknown): boolean {
  return /device offline|device unauthorized|no devices\/emulators found/i.test(
    errorMessage(error),
  );
}

export function isRetryableUiDumpError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    isTransientAdbTransportError(error) ||
    /No such file or directory|empty (?:Chrome UI|uiautomator) dump/i.test(
      message,
    ) ||
    /uiautomator dump[\s\S]*exited with code 255/i.test(message)
  );
}
