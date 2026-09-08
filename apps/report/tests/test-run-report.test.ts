import { describe, expect, it } from '@rstest/core';
import {
  parseTestRunReportDump,
  runnerHashForRoute,
  runnerRouteFromHash,
  runnerStepIdFromHash,
} from '../src/utils/test-run-report';

const validDump = {
  schemaVersion: 1,
  kind: 'test-runner',
  runId: 'run-1',
  status: 'success',
  summary: {},
  metrics: {},
  projects: [],
};

describe('Midscene Test report utilities', () => {
  it('parses the independent Runner dump', () => {
    expect(parseTestRunReportDump(JSON.stringify(validDump))).toMatchObject({
      schemaVersion: 1,
      kind: 'test-runner',
      runId: 'run-1',
    });
  });

  it('rejects unsupported schemas', () => {
    expect(() =>
      parseTestRunReportDump(
        JSON.stringify({ ...validDump, schemaVersion: 2 }),
      ),
    ).toThrow('Unsupported Midscene Test report schema');
  });

  it('reads a namespaced Step deep link', () => {
    expect(
      runnerStepIdFromHash('#runner-step=attempt%3Asteps%3A0&task=task-1'),
    ).toBe('attempt:steps:0');
  });

  it('round-trips Case and Overview routes without an intermediate project page', () => {
    const caseHash = runnerHashForRoute(
      {
        page: 'case',
        caseKey: 'project:document:case',
        projectId: 'project',
        stepId: 'failed-step',
      },
      '#external=value&runner-parent=project&runner-step=old-step&task=old-task',
    );
    expect(runnerRouteFromHash(caseHash)).toEqual({
      page: 'case',
      caseKey: 'project:document:case',
      projectId: 'project',
    });
    expect(new URLSearchParams(caseHash.slice(1)).get('external')).toBe(
      'value',
    );
    expect(runnerStepIdFromHash(caseHash)).toBe('failed-step');
    expect(caseHash).not.toContain('runner-parent');
    expect(caseHash).not.toContain('old-step');
    expect(caseHash).not.toContain('old-task');
    expect(runnerHashForRoute({ page: 'overview' }, caseHash)).toBe(
      '#external=value',
    );
  });

  it('falls back to Overview for the removed project page', () => {
    expect(
      runnerRouteFromHash('#runner-page=project&runner-project=web'),
    ).toEqual({ page: 'overview' });
  });

  it('folds the retired Cases route into Overview and clears its filters', () => {
    const hash = runnerHashForRoute(
      { page: 'overview' },
      '#runner-page=cases&runner-query=NODE_EXECUTION_ERROR&runner-status=failed&runner-filter-project=android+smoke&runner-sort=retries&external=value',
    );
    expect(hash).toBe('#external=value');
    expect(runnerRouteFromHash('#runner-page=cases')).toEqual({
      page: 'overview',
    });
    expect(new URLSearchParams(hash.slice(1)).get('external')).toBe('value');
  });

  it('falls back to Overview for an incomplete route', () => {
    expect(runnerRouteFromHash('#runner-page=case&runner-case=case-1')).toEqual(
      { page: 'overview' },
    );
    expect(runnerHashForRoute({ page: 'overview' }, '#runner-page=cases')).toBe(
      '#',
    );
  });
});
