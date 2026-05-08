import { describe, expect, it } from '@rstest/core';
import {
  type RstestTestContext,
  buildReportMeta,
  deriveStatus,
} from '../../src/report-helper';

function ctx(
  name: string,
  result?: RstestTestContext['task']['result'],
): RstestTestContext {
  return { task: { id: 't1', name, result } };
}

describe('deriveStatus', () => {
  it('maps pass → passed', () => {
    expect(deriveStatus({ status: 'pass' })).toBe('passed');
  });

  it('maps fail → failed', () => {
    expect(deriveStatus({ status: 'fail' })).toBe('failed');
  });

  it('detects timeout from error message substring', () => {
    expect(
      deriveStatus({
        status: 'fail',
        errors: [{ message: 'hook timed out in 60000ms' }],
      }),
    ).toBe('timedOut');
  });

  it('falls back to passed when result is missing', () => {
    expect(deriveStatus(undefined)).toBe('passed');
  });

  it('treats skip/todo as passed (no dedicated mapping)', () => {
    expect(deriveStatus({ status: 'skip' })).toBe('passed');
    expect(deriveStatus({ status: 'todo' })).toBe('passed');
  });
});

describe('buildReportMeta', () => {
  it('derives groupName from file basename without extension', () => {
    const meta = buildReportMeta(
      ctx('adds a todo'),
      '/repo/e2e/todo-list.test.ts',
    );
    expect(meta.groupName).toBe('E2E: todo-list.test');
  });

  it('falls back when filepath has no basename', () => {
    const meta = buildReportMeta(ctx('case'), '');
    expect(meta.groupName).toBe('E2E: UnnamedGroup');
  });

  it('reportFileName embeds basename and task name', () => {
    const meta = buildReportMeta(ctx('case A'), '/x/foo.test.ts');
    expect(meta.reportFileName.startsWith('E2E-foo.test-case A-')).toBe(true);
    // trailing timestamp
    expect(meta.reportFileName).toMatch(/-\d{8}-\d{9}$/);
  });
});
