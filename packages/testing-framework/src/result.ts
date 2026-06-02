import type { FrameworkCaseResult, FrameworkSuiteSummary } from './types';

/**
 * Filename of the machine-readable suite summary the worker writes into the
 * runner's `resultDir`. It is the single hand-off channel between the Rstest
 * worker (which owns the results) and the runner (which only reads it).
 */
export const SUITE_SUMMARY_FILENAME = 'summary.json';

/** An empty summary, used when the worker produced no summary file. */
export const emptySuiteSummary = (): FrameworkSuiteSummary => ({
  total: 0,
  passed: 0,
  failed: 0,
  durationMs: 0,
  results: [],
});

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
