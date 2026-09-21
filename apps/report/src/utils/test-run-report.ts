import type { TestRunReportDump } from '@midscene/core';
import { antiEscapeScriptTag } from '@midscene/shared/utils';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parse and minimally validate the UI-facing Midscene Test report snapshot. */
export function parseTestRunReportDump(content: string): TestRunReportDump {
  const parsed: unknown = JSON.parse(antiEscapeScriptTag(content));
  if (!isRecord(parsed)) {
    throw new Error('Midscene Test report dump must be a JSON object.');
  }
  if (parsed.schemaVersion !== 1 || parsed.kind !== 'test-runner') {
    throw new Error(
      `Unsupported Midscene Test report schema: ${String(parsed.schemaVersion)}.`,
    );
  }
  if (
    typeof parsed.runId !== 'string' ||
    !['success', 'failed'].includes(String(parsed.status)) ||
    !Array.isArray(parsed.projects) ||
    !isRecord(parsed.summary) ||
    !isRecord(parsed.metrics)
  ) {
    throw new Error('Midscene Test report dump is missing required fields.');
  }
  return parsed as unknown as TestRunReportDump;
}

export function runnerStepIdFromHash(hash: string): string | undefined {
  if (!hash.startsWith('#')) return undefined;
  return new URLSearchParams(hash.slice(1)).get('runner-step') || undefined;
}

export type RunnerRoute =
  | { page: 'overview' }
  | {
      page: 'case';
      caseKey: string;
      projectId: string;
      stepId?: string;
    };

const runnerRouteKeys = [
  'runner-page',
  'runner-project',
  'runner-case',
  'runner-parent',
  'runner-trace',
  'runner-query',
  'runner-status',
  'runner-filter-project',
  'runner-sort',
] as const;

/** Read the Midscene Test page selection from a static-report-safe URL hash. */
export function runnerRouteFromHash(hash: string): RunnerRoute {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : '');
  switch (params.get('runner-page')) {
    case 'case': {
      const caseKey = params.get('runner-case');
      const projectId = params.get('runner-project');
      if (!caseKey || !projectId) return { page: 'overview' };
      return {
        page: 'case',
        caseKey,
        projectId,
      };
    }
    default:
      return { page: 'overview' };
  }
}

/** Build a route hash while preserving hash parameters owned by other views. */
export function runnerHashForRoute(
  route: RunnerRoute,
  currentHash = '',
): string {
  const params = new URLSearchParams(
    currentHash.startsWith('#') ? currentHash.slice(1) : '',
  );
  for (const key of runnerRouteKeys) params.delete(key);
  params.delete('runner-step');
  params.delete('task');

  if (route.page !== 'overview') params.set('runner-page', route.page);
  if (route.page === 'case') {
    params.set('runner-project', route.projectId);
    params.set('runner-case', route.caseKey);
    if (route.stepId) params.set('runner-step', route.stepId);
  }

  const hash = params.toString();
  return hash ? `#${hash}` : '#';
}

export function updateRunnerStepHash(stepId: string): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  params.set('runner-step', stepId);
  params.delete('task');
  window.history.replaceState(null, '', `#${params.toString()}`);
}

export function clearRunnerStepHash(): void {
  const params = new URLSearchParams(window.location.hash.slice(1));
  params.delete('runner-step');
  params.delete('task');
  const hash = params.toString();
  window.history.replaceState(null, '', hash ? `#${hash}` : '#');
}
