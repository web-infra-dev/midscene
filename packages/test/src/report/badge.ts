import type { TestRunReportDump } from '@midscene/core';

/** Omit case-count badges when they cannot represent the failed run. */
export function renderTestBadgeLines({
  status,
  summary,
}: Pick<TestRunReportDump, 'status' | 'summary'>): string[] {
  if (status !== 'success' && summary.failed === 0) return [];
  return [
    `![Midscene Test: ${summary.passed} passed, ${summary.failed} failed](https://badge.midscenejs.com/e2e?pass=${summary.passed}&fail=${summary.failed}&style=large)`,
    '',
  ];
}
