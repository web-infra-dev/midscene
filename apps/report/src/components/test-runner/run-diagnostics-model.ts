import type {
  TestRunReportCleanup,
  TestRunReportDump,
  TestRunReportError,
  TestRunReportOperationReference,
  TestRunReportStep,
} from '@midscene/core';

export type DiagnosticCategory =
  | 'execution'
  | 'blocked'
  | 'evidence'
  | 'cleanup'
  | 'infrastructure';
export interface RunIssueEntry {
  label: string;
  message: string;
  error?: TestRunReportError;
  stepId?: string;
  ids?: Record<string, unknown>;
}
export interface RunIssueGroup {
  key: string;
  category: DiagnosticCategory;
  label: string;
  entries: RunIssueEntry[];
}

export function getRunDiagnostics(dump: TestRunReportDump) {
  const groups = new Map<string, RunIssueGroup>();
  const seenSteps = new Set<string>();
  const stepLabels = new Map<string, string>();
  const pendingOperations = new Map<string, RunIssueEntry[]>();
  const coveredOperations = new Set<string>();
  let failedSteps = 0;
  let timedOutSteps = 0;
  let blockedSteps = 0;
  let preparationFailures = 0;
  let pendingCleanupScopes = 0;
  const add = (
    key: string,
    category: DiagnosticCategory,
    label: string,
    entry: RunIssueEntry,
  ) => {
    const group = groups.get(key) ?? { key, category, label, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  };
  const steps = (values: readonly TestRunReportStep[], context: string) => {
    for (const step of values) {
      if (seenSteps.has(step.id)) continue;
      seenSteps.add(step.id);
      const label = `${context} · ${step.phase} ${step.stepIndex + 1}: ${step.node}${step.title ? ` · ${step.title}` : ''}`;
      stepLabels.set(step.id, label);
      if (step.status === 'failed') {
        failedSteps++;
        if (step.error?.code === 'STEP_TIMEOUT') timedOutSteps++;
        if (step.phase === 'beforeAll' || step.phase === 'beforeEach')
          preparationFailures++;
        add(`step:${step.id}`, 'execution', label, {
          label,
          message: step.error?.message ?? 'Step failed.',
          error: step.error,
          stepId: step.id,
        });
      } else if (step.status === 'not-run') {
        blockedSteps++;
        add(
          `blocked:${step.blockedBy ?? step.id}`,
          'blocked',
          'Steps not executed',
          {
            label,
            message: step.notRunReason,
            stepId: step.id,
            error: step.error,
            ids: step.blockedBy ? { blockedBy: step.blockedBy } : undefined,
          },
        );
      }
    }
  };
  const cleanup = (
    state: TestRunReportCleanup | undefined,
    errors: TestRunReportError[] | undefined,
    label: string,
    scopeId: string,
  ) => {
    if (state?.status === 'pending' || state?.status === 'failed') {
      if (state.status === 'pending') pendingCleanupScopes++;
      if (state.operationId) coveredOperations.add(state.operationId);
      for (const ref of state.blockingOperations ?? [])
        coveredOperations.add(ref.operationId);
      const blockers = [
        ...new Set(
          state.blockingOperations?.flatMap((ref) =>
            ref.stepId ? [ref.stepId] : [],
          ) ?? [],
        ),
      ].sort();
      add(
        `cleanup:${state.status}:${blockers.length ? blockers.join('|') : (state.operationId ?? scopeId)}`,
        'cleanup',
        state.status === 'pending'
          ? 'Cleanup waiting at snapshot'
          : 'Resource cleanup failed',
        {
          label,
          message:
            state.status === 'pending'
              ? 'Resources remain quarantined while outstanding operations settle; disposal is waiting.'
              : 'Resource cleanup failed; see the recorded causes.',
          error: state.error,
          stepId: blockers[0],
          ids: {
            operationId: state.operationId,
            blockingOperations: state.blockingOperations,
            capturedAt: state.capturedAt,
          },
        },
      );
    } else
      for (const [index, error] of (errors ?? []).entries())
        add(
          `cleanup:${scopeId}:${index}`,
          'cleanup',
          'Resource cleanup failed',
          {
            label,
            message: error.message,
            error,
          },
        );
  };
  const pending = (
    owner: { pendingOperations?: TestRunReportOperationReference[] },
    label: string,
  ) => {
    for (const ref of owner.pendingOperations ?? []) {
      const entries = pendingOperations.get(ref.operationId) ?? [];
      entries.push({
        label,
        message:
          'An operation is still running at the snapshot; another attempt cannot safely start.',
        stepId: ref.stepId,
        ids: { ...ref },
      });
      pendingOperations.set(ref.operationId, entries);
    }
  };
  for (const project of dump.projects) {
    if (project.lifecycle?.setupError) {
      preparationFailures++;
      const error = project.lifecycle.setupError;
      add(
        `setup:${project.projectId}`,
        'execution',
        'Project preparation failed',
        { label: project.name, message: error.message, error },
      );
    }
    cleanup(
      project.lifecycle?.cleanup,
      project.lifecycle?.teardownErrors,
      `${project.name} · Project cleanup`,
      project.projectId,
    );
    if (project.lifecycle) pending(project.lifecycle, project.name);
    for (const collection of project.collectionErrors)
      add(
        `collection:${project.projectId}:${collection.sourcePath}`,
        'infrastructure',
        'Test collection failed',
        {
          label: collection.sourcePath,
          message: collection.error.message,
          error: collection.error,
        },
      );
    for (const document of project.documents) {
      const context = `${project.name} · ${document.sourcePath}`;
      for (const attempt of document.attempts ?? [document]) {
        const label = `${context}${attempt.attemptIndex === undefined ? '' : ` · File attempt ${attempt.attemptIndex + 1}`}`;
        steps([...attempt.beforeAll, ...attempt.afterAll], label);
        cleanup(
          attempt.cleanup,
          attempt.teardownErrors,
          `${label} · Document cleanup`,
          attempt.documentRunId ?? attempt.documentId,
        );
        pending(attempt, label);
        for (const host of attempt.hostErrors ?? []) {
          if (host.phase === 'cleanup' && attempt.cleanup?.status === 'failed')
            continue;
          if (host.phase === 'setup') preparationFailures++;
          add(
            `host:${attempt.documentRunId ?? attempt.documentId}:${host.phase}:${host.error.message}`,
            host.phase === 'setup' ? 'execution' : 'infrastructure',
            'Host lifecycle failures',
            {
              label: `${label} · ${host.phase}`,
              message: host.error.message,
              error: host.error,
            },
          );
        }
      }
      for (const testCase of document.cases)
        for (const attempt of testCase.attempts) {
          const label = `${context} · ${testCase.name} · Attempt ${attempt.attemptIndex + 1}`;
          steps(
            [...attempt.beforeEach, ...attempt.steps, ...attempt.afterEach],
            label,
          );
          cleanup(
            attempt.cleanup,
            attempt.teardownErrors,
            `${label} · Case cleanup`,
            attempt.attemptId,
          );
          pending(attempt, label);
          for (const host of attempt.hostErrors ?? [])
            add(
              `host:${attempt.attemptId}:${host.phase}`,
              'infrastructure',
              'Host lifecycle failures',
              {
                label: `${label} · ${host.phase}`,
                message: host.error.message,
                error: host.error,
              },
            );
        }
    }
  }
  for (const diagnostic of dump.diagnostics ?? [])
    add(
      `diagnostic:${diagnostic.code}:${diagnostic.scopeId ?? 'run'}`,
      diagnostic.code === 'run-infrastructure-error'
        ? 'infrastructure'
        : 'evidence',
      diagnostic.code === 'agent-detail-unresolved'
        ? 'Agent execution references could not be resolved'
        : diagnostic.code === 'agent-detail-unavailable'
          ? 'Executed steps have no stable Agent reference'
          : diagnostic.code === 'run-infrastructure-error'
            ? 'Run stopped by an infrastructure error'
            : 'Report data warnings',
      {
        label: diagnostic.stepId
          ? (stepLabels.get(diagnostic.stepId) ?? 'Step evidence')
          : 'Report collection',
        message: diagnostic.message,
        error: diagnostic.error,
        stepId: diagnostic.stepId,
        ids: {
          scopeId: diagnostic.scopeId,
          executionId: diagnostic.executionId,
          sourcePaths: diagnostic.sourcePaths,
        },
      },
    );
  for (const [operationId, entries] of pendingOperations)
    if (!coveredOperations.has(operationId))
      for (const entry of entries)
        add(
          `operation:${operationId}`,
          'blocked',
          'Operations still running at snapshot',
          entry,
        );
  const order: DiagnosticCategory[] = [
    'execution',
    'infrastructure',
    'blocked',
    'evidence',
    'cleanup',
  ];
  const ordered = [...groups.values()].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category),
  );
  const summary = [
    ...(preparationFailures
      ? [`${preparationFailures} preparation failure(s)`]
      : []),
    ...(timedOutSteps ? [`${timedOutSteps} timed-out step(s)`] : []),
    ...(failedSteps - timedOutSteps
      ? [`${failedSteps - timedOutSteps} other failed step(s)`]
      : []),
    ...(blockedSteps ? [`${blockedSteps} step(s) not executed`] : []),
    ...(dump.summary.notRun
      ? [`${dump.summary.notRun} case(s) did not start`]
      : []),
    ...(dump.metrics.collection?.status &&
    dump.metrics.collection.status !== 'complete'
      ? ['Agent evidence or model metrics are incomplete']
      : []),
    ...(pendingCleanupScopes
      ? [`${pendingCleanupScopes} scope(s) still awaiting cleanup at snapshot`]
      : []),
    ...(pendingOperations.size
      ? ['Unfinished operations remain at snapshot']
      : []),
  ].join('; ');
  return {
    groups: ordered,
    summary,
    failedSteps,
    timedOutSteps,
    blockedSteps,
    pendingCleanupScopes,
  };
}
