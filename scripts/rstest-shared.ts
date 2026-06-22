/**
 * Shared building blocks for the per-package `rstest.config.ts` files, so the
 * same boilerplate is defined once instead of copy-pasted across packages.
 */

/**
 * Externalize the photon native addon. Rspack cannot bundle its prebuilt
 * binary, so every node-target test config marks it as a CommonJS external.
 */
export const photonExternal = {
  '@silvia-odwyer/photon': 'commonjs @silvia-odwyer/photon',
} as const;

/**
 * Build the `source.define` entry that injects a package version as the
 * `__VERSION__` global. Centralizes the encoding so configs don't drift between
 * `` `'${version}'` `` and `JSON.stringify(version)`.
 */
export function defineVersion(version: string): { __VERSION__: string } {
  return { __VERSION__: JSON.stringify(version) };
}
