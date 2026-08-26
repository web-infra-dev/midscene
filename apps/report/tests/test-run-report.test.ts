import { describe, expect, it } from '@rstest/core';
import {
  defaultRunnerCaseFilters,
  parseTestRunReportDump,
  runnerCaseFiltersFromHash,
  runnerHashForCaseFilters,
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

describe('Test Runner report utilities', () => {
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
    ).toThrow('Unsupported Test Runner report schema');
  });

  it('reads a namespaced Step deep link', () => {
    expect(
      runnerStepIdFromHash('#runner-step=attempt%3Asteps%3A0&task=task-1'),
    ).toBe('attempt:steps:0');
  });

  it('round-trips Project and Case routes through the report hash', () => {
    const projectHash = runnerHashForRoute(
      { page: 'project', projectId: 'android smoke' },
      '#external=value&runner-step=old-step&task=old-task',
    );
    expect(projectHash).toBe(
      '#external=value&runner-page=project&runner-project=android+smoke',
    );
    expect(runnerRouteFromHash(projectHash)).toEqual({
      page: 'project',
      projectId: 'android smoke',
    });

    const caseHash = runnerHashForRoute(
      {
        page: 'case',
        caseKey: 'project:document:case',
        projectId: 'project',
        parent: 'cases',
        stepId: 'failed-step',
      },
      projectHash,
    );
    expect(runnerRouteFromHash(caseHash)).toEqual({
      page: 'case',
      caseKey: 'project:document:case',
      projectId: 'project',
      parent: 'cases',
    });
    expect(new URLSearchParams(caseHash.slice(1)).get('external')).toBe(
      'value',
    );
    expect(runnerStepIdFromHash(caseHash)).toBe('failed-step');
  });

  it('round-trips shareable Case filters without discarding the route', () => {
    const hash = runnerHashForCaseFilters(
      {
        query: 'NODE_EXECUTION_ERROR',
        status: 'failed',
        projectId: 'android smoke',
        sort: 'retries',
      },
      '#runner-page=cases&external=value',
    );
    expect(runnerCaseFiltersFromHash(hash)).toEqual({
      query: 'NODE_EXECUTION_ERROR',
      status: 'failed',
      projectId: 'android smoke',
      sort: 'retries',
    });
    expect(runnerRouteFromHash(hash)).toEqual({ page: 'cases' });
    expect(new URLSearchParams(hash.slice(1)).get('external')).toBe('value');
    expect(runnerCaseFiltersFromHash('#runner-status=unknown')).toEqual(
      defaultRunnerCaseFilters,
    );
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
