import type { TestRunReportSummary } from '@midscene/core';

/** Use final Case outcomes, not attempts or infrastructure errors. */
export function renderTestBadge(
  summary: Pick<TestRunReportSummary, 'passed' | 'failed'>,
): string {
  return `![Midscene Test: ${summary.passed} passed, ${summary.failed} failed](https://badge.midscenejs.com/e2e?pass=${summary.passed}&fail=${summary.failed}&style=large)`;
}
