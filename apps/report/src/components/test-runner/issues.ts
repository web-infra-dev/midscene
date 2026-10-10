import type {
  TestRunReportAttempt,
  TestRunReportDump,
  TestRunReportError,
  TestRunReportRetryDecision,
  TestRunReportStep,
} from '@midscene/core';
import { getStepIssueTitle } from './issue-presentation';

export interface ReportIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  title?: string;
  label?: string;
  error?: TestRunReportError;
  context?: Record<string, unknown>;
  relatedStepIds?: string[];
  projectId?: string;
  documentId?: string;
  scopeId?: string;
}

const rank = { error: 0, warning: 1, info: 2 };
export const sortIssues = (issues: readonly ReportIssue[]) =>
  [...issues].sort((a, b) => rank[a.severity] - rank[b.severity]);

/** Aggregate children are independent failures; a cause is part of one failure. */
export function splitIssue(issue: ReportIssue): ReportIssue[] {
  if (
    issue.severity === 'info' ||
    issue.error?.name !== 'AggregateError' ||
    !issue.error.errors?.length
  )
    return [issue];
  return issue.error.errors.flatMap((error, index) =>
    splitIssue({
      ...issue,
      id: `${issue.id}:${index}`,
      message: error.message,
      error,
      context: {
        ...issue.context,
        aggregateError: { ...issue.error, errors: undefined },
      },
    }),
  );
}

export function getStepIssues(
  step: TestRunReportStep,
  blockedStepCount = 0,
): ReportIssue[] {
  const issues: ReportIssue[] = [];
  if (step.status === 'not-run')
    issues.push({
      id: `${step.id}:not-run`,
      severity: 'info',
      code: 'NOT_RUN',
      message: step.notRunReason,
      error: step.error,
      relatedStepIds: step.blockedBy ? [step.blockedBy] : [],
    });
  else if (step.error)
    issues.push({
      id: `${step.id}:execution`,
      severity: 'error',
      code: step.error.code ?? step.error.name,
      title: getStepIssueTitle(step, blockedStepCount),
      message: step.error.message,
      error: step.error,
    });
  if (step.status !== 'not-run') {
    for (const [index, error] of (
      step.evidenceCollection?.errors ?? []
    ).entries())
      issues.push({
        id: `${step.id}:evidence:${index}`,
        severity: 'warning',
        code: error.code ?? 'EVIDENCE_COLLECTION_FAILED',
        message: error.message,
        error,
      });
    if (step.agentDetailDiagnostic)
      issues.push({
        id: `${step.id}:reference`,
        severity: 'warning',
        code: 'AGENT_DETAIL_UNAVAILABLE',
        message: step.agentDetailDiagnostic,
      });
    if (
      step.evidenceCollection &&
      step.evidenceCollection.status !== 'complete' &&
      !issues.some((issue) => issue.severity === 'warning')
    )
      issues.push({
        id: `${step.id}:partial`,
        severity: 'warning',
        code: 'PARTIAL_EVIDENCE',
        message: 'Execution evidence is incomplete at the capture boundary.',
        context: { capturedAt: step.evidenceCollection.capturedAt },
      });
  }
  for (const issue of issues)
    if (issue.severity === 'warning' && step.evidenceCollection?.capturedAt)
      issue.context = {
        ...issue.context,
        capturedAt: step.evidenceCollection.capturedAt,
      };
  return issues.flatMap(splitIssue);
}

type IssueInput = Pick<TestRunReportDump, 'projects'> &
  Partial<Pick<TestRunReportDump, 'diagnostics' | 'metrics'>>;
type IssueScope = Pick<
  TestRunReportAttempt,
  | 'cleanup'
  | 'teardownErrors'
  | 'pendingOperations'
  | 'retryDecision'
  | 'hostErrors'
>;
type IssueOwner = Pick<
  ReportIssue,
  'projectId' | 'documentId' | 'scopeId' | 'label'
>;

/** Cleanup failures keep their owner; waiting warnings follow a known blocker. */
export function collectReportIssues(dump: IssueInput) {
  const nodes = new Map<string, ReportIssue[]>();
  const others: ReportIssue[] = [];
  const coveredOperations = new Set<string>();
  const pending = new Map<string, ReportIssue>();
  const scopeOwners = new Map<string, Partial<ReportIssue>>();
  const addIssue = (issue: ReportIssue) => others.push(...splitIssue(issue));
  const addSteps = (steps: readonly TestRunReportStep[]) => {
    const blockedCounts = new Map<string, number>();
    for (const step of steps)
      if (step.status === 'not-run' && step.blockedBy)
        blockedCounts.set(
          step.blockedBy,
          (blockedCounts.get(step.blockedBy) ?? 0) + 1,
        );
    for (const step of steps) {
      if (nodes.has(step.id)) continue;
      nodes.set(step.id, getStepIssues(step, blockedCounts.get(step.id)));
    }
  };
  const addError = (
    id: string,
    error: TestRunReportError,
    owner: Partial<ReportIssue>,
  ) => {
    addIssue({
      id,
      severity: 'error',
      code: error.code ?? error.name,
      message: error.message,
      error,
      ...owner,
    });
  };
  const addScope = (
    scope: IssueScope,
    owner: IssueOwner,
    scopeName: 'Project' | 'Document' | 'Case',
  ) => {
    const {
      cleanup,
      teardownErrors: errors,
      pendingOperations: operations,
      retryDecision: retry,
    } = scope;
    const cleanupOwner = {
      ...owner,
      label: `${owner.label} · ${scopeName} cleanup`,
    };
    if (cleanup?.status === 'pending' || cleanup?.status === 'failed') {
      if (cleanup.operationId) coveredOperations.add(cleanup.operationId);
      for (const ref of cleanup.blockingOperations ?? [])
        coveredOperations.add(ref.operationId);
      addIssue({
        id: `cleanup:${owner.scopeId}`,
        severity: cleanup.status === 'failed' ? 'error' : 'warning',
        code:
          cleanup.status === 'failed'
            ? 'RESOURCE_CLEANUP_FAILED'
            : 'RESOURCE_CLEANUP_PENDING',
        title:
          cleanup.status === 'failed'
            ? `${scopeName} resource cleanup failed`
            : `${scopeName} resource cleanup is waiting for an operation to finish`,
        message:
          cleanup.error?.message ??
          (cleanup.status === 'failed'
            ? 'Resource cleanup failed.'
            : 'Cleanup is waiting for unfinished operations. Resources remain quarantined.'),
        error: cleanup.error,
        context: {
          capturedAt: cleanup.capturedAt,
          blockingOperations: cleanup.blockingOperations,
        },
        relatedStepIds: cleanup.blockingOperations?.flatMap((ref) =>
          ref.stepId ? [ref.stepId] : [],
        ),
        ...cleanupOwner,
      });
    } else {
      for (const [index, error] of (errors ?? []).entries())
        addError(`cleanup:${owner.scopeId}:${index}`, error, cleanupOwner);
    }
    for (const ref of operations ?? [])
      if (!pending.has(ref.operationId))
        pending.set(ref.operationId, {
          id: `operation:${ref.operationId}`,
          severity: 'warning',
          code: 'OPERATION_PENDING',
          message: 'An operation is still running at this snapshot.',
          context: { ...ref },
          relatedStepIds: ref.stepId ? [ref.stepId] : [],
          ...cleanupOwner,
        });
    const blockers = cleanup?.blockingOperations ?? operations ?? [];
    const reasons: Partial<
      Record<TestRunReportRetryDecision['reason'], string>
    > = {
      'cleanup-pending': 'resource cleanup is still pending',
      'cleanup-failed': 'resource cleanup failed',
      'operation-pending': 'an operation is still running',
      'fatal-error': 'the device encountered a fatal error',
      interrupted: 'the run was interrupted',
      bail: 'the stop policy ended the run',
      'infrastructure-error': 'the test environment failed',
    };
    const reason = retry && reasons[retry.reason];
    if (
      retry?.decision === 'stop' &&
      retry.attemptIndex < retry.retryCount &&
      reason
    )
      others.push({
        id: `retry:${owner.scopeId}`,
        severity: 'warning',
        code: 'RETRY_STOPPED',
        title: `${retry.scope === 'case' ? 'Case' : 'Document'} retries stopped because ${reason}`,
        message: `${retry.attemptIndex + 1} of ${retry.retryCount + 1} allowed attempts ran. The remaining attempts were not started.`,
        relatedStepIds: blockers.flatMap((ref) =>
          ref.stepId ? [ref.stepId] : [],
        ),
        ...owner,
        label: owner.label ? `${owner.label} · Retry` : undefined,
      });
    for (const [index, host] of (scope.hostErrors ?? []).entries()) {
      if (host.phase === 'cleanup' && scope.cleanup?.status === 'failed')
        continue;
      addError(`host:${owner.scopeId}:${index}`, host.error, {
        ...owner,
        label: `${owner.label} · ${host.phase}`,
      });
    }
  };
  for (const project of dump.projects) {
    const projectOwner = {
      projectId: project.projectId,
      scopeId: project.projectId,
      label: `Project ${project.name}`,
    };
    scopeOwners.set(project.projectId, projectOwner);
    if (project.lifecycle?.setupError)
      addError(
        `setup:${project.projectId}`,
        project.lifecycle.setupError,
        projectOwner,
      );
    if (project.lifecycle) addScope(project.lifecycle, projectOwner, 'Project');
    for (const [index, item] of project.collectionErrors.entries())
      addError(`collection:${project.projectId}:${index}`, item.error, {
        ...projectOwner,
        label: `${project.name} · ${item.sourcePath}`,
      });
    for (const document of project.documents) {
      const owner = {
        projectId: project.projectId,
        documentId: document.documentId,
        label: `${project.name} · ${document.sourcePath}`,
      };
      for (const attempt of document.attempts ?? [document]) {
        const scopeId = attempt.documentRunId ?? attempt.documentId;
        scopeOwners.set(scopeId, { ...owner, scopeId });
        const label = `${owner.label}${attempt.attemptIndex === undefined ? '' : ` · File attempt ${attempt.attemptIndex + 1}`}`;
        addSteps([...attempt.beforeAll, ...attempt.afterAll]);
        addScope(attempt, { ...owner, scopeId, label }, 'Document');
      }
      for (const testCase of document.cases)
        for (const attempt of testCase.attempts) {
          const label = `${owner.label} · ${testCase.name} · Attempt ${attempt.attemptIndex + 1}`;
          const scope = { ...owner, scopeId: attempt.attemptId, label };
          scopeOwners.set(attempt.attemptId, scope);
          addSteps([
            ...attempt.beforeEach,
            ...attempt.steps,
            ...attempt.afterEach,
          ]);
          addScope(attempt, scope, 'Case');
        }
    }
  }
  for (const [operationId, issue] of pending)
    if (!coveredOperations.has(operationId)) others.push(issue);

  for (const [index, diagnostic] of (dump.diagnostics ?? []).entries()) {
    const details = diagnostic.error?.details?.value;
    const scopeId =
      diagnostic.scopeId ??
      (details &&
      typeof details === 'object' &&
      'scopeId' in details &&
      typeof details.scopeId === 'string'
        ? details.scopeId
        : undefined);
    const issue: ReportIssue = {
      id: `diagnostic:${index}`,
      severity:
        diagnostic.code === 'run-infrastructure-error'
          ? 'error'
          : diagnostic.level,
      code: diagnostic.code,
      message: diagnostic.message,
      error: diagnostic.error,
      ...scopeOwners.get(scopeId ?? ''),
      scopeId,
      label: scopeOwners.get(scopeId ?? '')?.label ?? 'Report collection',
      context: {
        scopeId,
        executionId: diagnostic.executionId,
        sourcePaths: diagnostic.sourcePaths,
      },
    };
    const stepIssues = diagnostic.stepId
      ? nodes.get(diagnostic.stepId)
      : undefined;
    if (stepIssues) {
      // The step already contains the human-readable reference/collection issue.
      if (stepIssues.some((item) => item.id.endsWith(':not-run'))) continue;
      const existing = stepIssues.find(
        (item) =>
          (['agent-detail-unresolved', 'agent-detail-unavailable'].includes(
            diagnostic.code,
          ) &&
            item.id.endsWith(':reference')) ||
          item.message === diagnostic.error?.message ||
          item.message === diagnostic.message,
      );
      if (existing) {
        const records = (existing.context?.diagnostics ?? []) as unknown[];
        existing.context = {
          ...existing.context,
          diagnostics: [
            ...records,
            {
              code: diagnostic.code,
              ...issue.context,
            },
          ],
        };
        continue;
      }
      stepIssues.push({ ...issue, label: undefined });
    } else {
      for (const candidate of splitIssue(issue))
        if (
          !others.some(
            (item) =>
              scopeId &&
              item.scopeId === scopeId &&
              item.error &&
              candidate.error &&
              JSON.stringify(item.error) === JSON.stringify(candidate.error),
          )
        )
          others.push(candidate);
    }
  }
  const collection = dump.metrics?.collection;
  if (dump.metrics && collection?.status !== 'complete')
    others.push({
      id: 'metrics',
      severity: 'warning',
      code:
        collection?.status === 'partial'
          ? 'PARTIAL_MODEL_METRICS'
          : 'MODEL_METRICS_UNKNOWN',
      message:
        collection?.status === 'partial'
          ? 'Model metrics are partial; collected values may undercount usage.'
          : 'Model usage is unknown.',
      context: collection ? { ...collection } : undefined,
    });
  for (let index = others.length - 1; index >= 0; index--) {
    const issue = others[index];
    if (issue.severity === 'error') continue;
    const blockers = [...new Set(issue.relatedStepIds)];
    if (blockers.length !== 1 || !nodes.has(blockers[0])) continue;
    nodes.get(blockers[0])!.push(issue);
    others.splice(index, 1);
  }
  return { nodes, others: sortIssues(others) };
}

export type ReportIssues = ReturnType<typeof collectReportIssues>;
