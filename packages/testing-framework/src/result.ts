import type { FrameworkCaseResult, FrameworkSuiteSummary } from './types';

/**
 * Build a stable, filesystem-safe stem for a per-case result file. The index
 * keeps ordering deterministic even when two cases normalize to the same name.
 */
export const safeResultStem = (relativePath: string, index: number): string => {
  const base = relativePath
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${String(index + 1).padStart(3, '0')}-${base || 'case'}`;
};

/** Aggregate per-case results into a suite summary. */
export const buildSuiteSummary = (
  results: FrameworkCaseResult[],
): FrameworkSuiteSummary => ({
  total: results.length,
  passed: results.filter((result) => result.success).length,
  failed: results.filter((result) => !result.success).length,
  durationMs: results.reduce((sum, result) => sum + (result.duration || 0), 0),
  results,
});
