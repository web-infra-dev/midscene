/**
 * Common Rspack configuration helpers for rsbuild projects
 */

/**
 * Common warning patterns to ignore in Rspack builds.
 * These warnings are typically from optional dependencies or known non-critical issues.
 */
export const commonIgnoreWarnings = [
  // Ignore dynamic import warnings from langsmith/langfuse optional dependencies
  /Critical dependency: the request of a dependency is an expression/,
];
