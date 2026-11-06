import { readFileSync } from 'node:fs';
import { expect, it } from '@rstest/core';

it('builds fixtures and runs Report tests in one checkout pinned to the event SHA', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/ai.yml', import.meta.url),
    'utf8',
  );
  const report = workflow.slice(workflow.indexOf('  e2e-report:'));
  expect(report.match(/uses: actions\/checkout@/g)).toHaveLength(1);
  expect(report).toContain(
    "ref: ${{ github.event_name == 'workflow_dispatch' && inputs.branch || github.sha }}",
  );
  expect(report).toContain('node apps/report/scripts/generate-demo-report.mjs');
  expect(report).toContain('node ../../packages/test/bin/midscene-test');
  expect(report).not.toContain('actions/download-artifact');
  expect(report).not.toContain('matrix:');
});
