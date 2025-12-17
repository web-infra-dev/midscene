// Type declaration for webpack's __non_webpack_require__
declare const __non_webpack_require__: typeof require | undefined;

/**
 * Get a require function that won't be processed by webpack.
 * Returns __non_webpack_require__ if available (in webpack environment),
 * otherwise falls back to the standard require.
 */
export function getWebpackRequire(): typeof require {
  return typeof __non_webpack_require__ !== 'undefined'
    ? __non_webpack_require__
    : require;
}
