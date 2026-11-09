import type { TestRunReportSummary } from '@midscene/core';

/**
 * Use final Case outcomes, not attempts or infrastructure errors.
 * Not-run cases count toward `fail`: the badge service only accepts pass
 * and fail, and a run with not-run cases has failed.
 */
export function renderTestBadge(
  summary: Pick<TestRunReportSummary, 'passed' | 'failed' | 'notRun'>,
): string {
  const fail = summary.failed + summary.notRun;
  return `![Midscene Test: ${summary.passed} passed, ${fail} failed](https://badge.midscenejs.com/e2e?pass=${summary.passed}&fail=${fail}&style=large)`;
}
