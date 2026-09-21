import { existsSync } from 'node:fs';

/**
 * Resolve a packaged resource path for use by an external process.
 *
 * Electron can read files inside app.asar through Node APIs, but external
 * processes cannot. Electron hosts must configure asarUnpack or unpackDir to
 * extract node_modules/@midscene/android/bin/**; this resolves that unpacked
 * sibling only when it exists.
 */
export function resolveExternalResourcePath(
  resourcePath: string,
  pathExists: (path: string) => boolean = existsSync,
): string {
  const unpackedPath = resourcePath.replace(
    /\.asar([/\\])/,
    '.asar.unpacked$1',
  );

  return unpackedPath !== resourcePath && pathExists(unpackedPath)
    ? unpackedPath
    : resourcePath;
}
