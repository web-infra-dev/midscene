import { existsSync } from 'node:fs';

/**
 * Resolve a resource path that will be consumed by an external process.
 * Electron's Node APIs can read files from app.asar, but child processes
 * cannot. electron-builder places unpacked files beside the archive using
 * the app.asar.unpacked suffix.
 */
export function resolveExternalResourcePath(resourcePath: string): string {
  const unpackedPath = resourcePath.replace(
    /\.asar([/\\])/,
    '.asar.unpacked$1',
  );

  return unpackedPath !== resourcePath && existsSync(unpackedPath)
    ? unpackedPath
    : resourcePath;
}
