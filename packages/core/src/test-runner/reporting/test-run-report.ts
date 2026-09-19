import type {
  IndexedTestRunReportSource,
  TestRunReportAgentDetail,
  TestRunReportAttempt,
  TestRunReportCase,
  TestRunReportDiagnostic,
  TestRunReportDocument,
  TestRunReportDump,
  TestRunReportProject,
  TestRunReportSource,
  TestRunReportSourceIndex,
  TestRunReportStep,
} from '../../test-run-report';
import type {
  CaseRunResult,
  StepRunResult,
  WorkflowDocumentRunResult,
} from '../engine/types';
import {
  sanitizeReportError,
  sanitizeReportText,
  sanitizeReportValue,
} from './sanitize';
import type { RunReportCaseInput, RunReportInput } from './types';

const exactMidsceneDetailNodes = new Set([
  'aiAct',
  'aiAssert',
  'recordToReport',
]);

interface ManifestBuildContext {
  diagnostics: TestRunReportDiagnostic[];
  sourcesByScope: Map<string, IndexedTestRunReportSource[]>;
  detailsByScopeAndExecution: Map<string, TestRunReportAgentDetail>;
  tracedScopeByExecution: Map<string, string>;
}

const scopedExecutionKey = (scopeId: string, executionId: string): string =>
  `${scopeId}\u0000${executionId}`;

const reportSourcesForScope = (
  context: ManifestBuildContext,
  scopeId: string,
): IndexedTestRunReportSource[] => context.sourcesByScope.get(scopeId) ?? [];

const addDiagnostic = (
  context: ManifestBuildContext,
  diagnostic: TestRunReportDiagnostic,
): void => {
  context.diagnostics.push(diagnostic);
};

const buildStep = (
  step: StepRunResult,
  scopeId: string,
  context: ManifestBuildContext,
  executionId: string,
): TestRunReportStep => {
  const details: TestRunReportAgentDetail[] = [];
  const unresolvedExecutionIds: string[] = [];
  for (const trace of step.report?.traces ?? []) {
    const previousScope = context.tracedScopeByExecution.get(trace.executionId);
    if (previousScope && previousScope !== scopeId) {
      throw new Error(
        `Agent execution ${trace.executionId} was traced by multiple test scopes (${previousScope}, ${scopeId}).`,
      );
    }
    context.tracedScopeByExecution.set(trace.executionId, scopeId);
    const detail = context.detailsByScopeAndExecution.get(
      scopedExecutionKey(scopeId, trace.executionId),
    );
    if (detail) details.push(detail);
    else unresolvedExecutionIds.push(trace.executionId);
  }

  let agentDetailDiagnostic: string | undefined;
  if (unresolvedExecutionIds.length > 0) {
    agentDetailDiagnostic = `Agent detail could not be resolved for ${unresolvedExecutionIds.join(', ')}.`;
    const sources = reportSourcesForScope(context, scopeId);
    for (const executionId of unresolvedExecutionIds) {
      addDiagnostic(context, {
        level: 'warning',
        code: 'agent-detail-unresolved',
        message: `Agent detail could not be resolved for execution ${executionId} in test scope ${scopeId}.`,
        scopeId,
        executionId,
        ...(sources.length > 0
          ? { sourcePaths: sources.map((source) => source.sourcePath) }
          : {}),
      });
    }
  } else if (details.length === 0 && exactMidsceneDetailNodes.has(step.node)) {
    agentDetailDiagnostic =
      'This Agent did not expose a stable execution reference for the Step.';
    addDiagnostic(context, {
      level: 'warning',
      code: 'agent-detail-unavailable',
      message: `No stable Agent execution reference was captured for ${step.node} in test scope ${scopeId}.`,
      scopeId,
      ...(reportSourcesForScope(context, scopeId).length > 0
        ? {
            sourcePaths: reportSourcesForScope(context, scopeId).map(
              (source) => source.sourcePath,
            ),
          }
        : {}),
    });
  }

  const input = step.input as Record<string, unknown> | undefined;
  const candidateTitle =
    input?.prompt ?? input?.script ?? input?.scenario ?? input?.title;
  const prompt =
    typeof candidateTitle === 'string'
      ? candidateTitle
      : typeof candidateTitle === 'object' &&
          candidateTitle !== null &&
          'prompt' in candidateTitle &&
          typeof candidateTitle.prompt === 'string'
        ? candidateTitle.prompt
        : undefined;
  return {
    id: `${executionId}:${step.phase}:${step.stepIndex}`,
    phase: step.phase,
    stepIndex: step.stepIndex,
    node: step.node,
    ...(prompt ? { title: sanitizeReportText(prompt, 240) } : {}),
    status: step.status,
    continuedAfterError: step.continuedAfterError,
    startedAt: step.startedAt,
    endedAt: step.endedAt,
    durationMs: step.durationMs,
    input: sanitizeReportValue(step.input),
    ...(step.output
      ? {
          output: {
            ...(step.output.summary === undefined
              ? {}
              : { summary: sanitizeReportText(step.output.summary) }),
            ...(step.output.data === undefined
              ? {}
              : { data: sanitizeReportValue(step.output.data) }),
          },
        }
      : {}),
    ...(step.error ? { error: sanitizeReportError(step.error) } : {}),
    ...(details.length > 0 ? { agentDetails: details } : {}),
    ...(agentDetailDiagnostic ? { agentDetailDiagnostic } : {}),
  };
};

const attemptReportScope = (attempt: CaseRunResult): string =>
  attempt.reportScopeId ?? attempt.runId;

const buildAttempt = (
  attempt: CaseRunResult,
  context: ManifestBuildContext,
): TestRunReportAttempt => {
  const scopeId = attemptReportScope(attempt);
  return {
    attemptId: attempt.runId,
    attemptIndex: attempt.attemptIndex,
    status: attempt.status,
    startedAt: attempt.startedAt,
    endedAt: attempt.endedAt,
    durationMs: attempt.durationMs,
    beforeEach: attempt.beforeEach.map((step) =>
      buildStep(step, scopeId, context, attempt.runId),
    ),
    steps: attempt.steps.map((step) =>
      buildStep(step, scopeId, context, attempt.runId),
    ),
    afterEach: attempt.afterEach.map((step) =>
      buildStep(step, scopeId, context, attempt.runId),
    ),
    ...(attempt.executionErrors?.length
      ? {
          hostErrors: attempt.executionErrors.map((error) => ({
            phase: 'execution' as const,
            error: sanitizeReportError(error),
          })),
        }
      : {}),
    ...(attempt.teardownErrors?.length
      ? { teardownErrors: attempt.teardownErrors.map(sanitizeReportError) }
      : {}),
    ...(reportSourcesForScope(context, scopeId).length > 0
      ? {
          scopeReportIds: reportSourcesForScope(context, scopeId).map(
            (source) => source.reportId,
          ),
        }
      : {}),
  };
};

const buildCase = (
  outcome: RunReportCaseInput,
  context: ManifestBuildContext,
): TestRunReportCase => ({
  caseId: outcome.caseId,
  name: outcome.name,
  caseIndex: outcome.caseIndex,
  status: outcome.status,
  ...(outcome.notRunReason ? { notRunReason: outcome.notRunReason } : {}),
  attempts: (outcome.attempts ?? (outcome.run ? [outcome.run] : [])).map(
    (attempt) => buildAttempt(attempt, context),
  ),
});

const documentReportScope = (document: WorkflowDocumentRunResult): string =>
  document.reportScopeId ?? document.documentRunId;

const buildDocument = (
  documentId: string,
  document: WorkflowDocumentRunResult | undefined,
  cases: readonly RunReportCaseInput[],
  context: ManifestBuildContext,
): TestRunReportDocument => {
  const sourcePath =
    document?.sourcePath ?? cases[0]?.sourcePath ?? '<unknown>';
  const status =
    document?.status ??
    (cases.some((item) => item.status !== 'success') ? 'failed' : 'success');
  const scopeId = document ? documentReportScope(document) : undefined;
  return {
    documentId,
    ...(document
      ? {
          logicalDocumentId: document.documentId,
          documentRunId: document.documentRunId,
          ...(document.attemptIndex === undefined
            ? {}
            : { attemptIndex: document.attemptIndex }),
        }
      : {}),
    sourcePath,
    status,
    ...(document
      ? {
          startedAt: document.startedAt,
          endedAt: document.endedAt,
          durationMs: document.durationMs,
        }
      : {}),
    beforeAll: (document?.beforeAll ?? []).map((step) =>
      buildStep(step, scopeId!, context, document!.documentRunId),
    ),
    cases: cases.map((outcome) => buildCase(outcome, context)),
    afterAll: (document?.afterAll ?? []).map((step) =>
      buildStep(step, scopeId!, context, document!.documentRunId),
    ),
    ...(document?.hostErrors?.length || document?.executionErrors?.length
      ? {
          hostErrors: [
            ...(document?.hostErrors ?? []),
            ...(document?.executionErrors ?? []).map((error) => ({
              phase: 'execution' as const,
              error,
            })),
          ].map(({ phase, error }) => ({
            phase,
            error: sanitizeReportError(error),
          })),
        }
      : {}),
    ...(document?.teardownErrors?.length
      ? { teardownErrors: document.teardownErrors.map(sanitizeReportError) }
      : {}),
    ...(scopeId && reportSourcesForScope(context, scopeId).length > 0
      ? {
          scopeReportIds: reportSourcesForScope(context, scopeId).map(
            (source) => source.reportId,
          ),
        }
      : {}),
  };
};

const buildProject = (
  project: RunReportInput['projects'][number],
  context: ManifestBuildContext,
): TestRunReportProject => {
  const documentCount = new Map<string, number>();
  for (const document of project.documents) {
    documentCount.set(
      document.documentId,
      (documentCount.get(document.documentId) ?? 0) + 1,
    );
  }
  for (const outcome of project.cases) {
    if (
      (documentCount.get(outcome.documentId) ?? 0) > 1 &&
      !outcome.documentRunId
    ) {
      throw new Error(
        `Case ${outcome.caseId} must identify its documentRunId when a document has multiple attempts.`,
      );
    }
  }
  // A new attemptIndex 0 begins a distinct invocation of the same file. Only
  // whole-file retries belong to one logical document and its Case history.
  const groups: WorkflowDocumentRunResult[][] = [];
  const currentGroup = new Map<string, WorkflowDocumentRunResult[]>();
  for (const document of project.documents) {
    let group = currentGroup.get(document.documentId);
    if (!group || !document.attemptIndex) {
      group = [];
      groups.push(group);
      currentGroup.set(document.documentId, group);
    }
    group.push(document);
  }
  const documents = groups.map((group) => {
    const first = group[0];
    const last = group.at(-1)!;
    const documentId =
      groups.filter((item) => item[0].documentId === first.documentId).length >
      1
        ? `${first.documentId}:${first.documentRunId}`
        : first.documentId;
    const outcomes = new Map<string, RunReportCaseInput>();
    for (const document of group) {
      for (const outcome of project.cases.filter(
        (item) =>
          item.documentId === document.documentId &&
          (!item.documentRunId ||
            item.documentRunId === document.documentRunId),
      )) {
        const previous = outcomes.get(outcome.caseId);
        outcomes.set(outcome.caseId, {
          ...outcome,
          attempts: [
            ...(previous?.attempts ?? []),
            ...(outcome.attempts ?? (outcome.run ? [outcome.run] : [])).map(
              (attempt) => ({
                ...attempt,
                attemptIndex: document.attemptIndex ?? attempt.attemptIndex,
              }),
            ),
          ],
        });
      }
    }
    const result = buildDocument(
      documentId,
      last,
      [...outcomes.values()],
      context,
    );
    if (group.length > 1) {
      result.startedAt = first.startedAt;
      result.durationMs = Math.max(
        0,
        Date.parse(last.endedAt) - Date.parse(first.startedAt),
      );
      result.attempts = group.map((document) => {
        const { cases: _cases, ...attempt } = buildDocument(
          documentId,
          document,
          [],
          context,
        );
        return attempt;
      });
    }
    return result;
  });
  // Collection/setup failures can have Cases but no started document runtime.
  for (const documentId of new Set(
    project.cases.map((outcome) => outcome.documentId),
  )) {
    if (!documentCount.has(documentId)) {
      documents.push(
        buildDocument(
          documentId,
          undefined,
          project.cases.filter((outcome) => outcome.documentId === documentId),
          context,
        ),
      );
    }
  }

  return {
    projectId: project.projectId,
    name: project.name,
    platform: project.platform,
    status: project.status,
    retry: project.retry,
    ...(project.lifecycle
      ? {
          lifecycle: {
            status: project.lifecycle.status,
            startedAt: project.lifecycle.startedAt,
            endedAt: project.lifecycle.endedAt,
            durationMs: project.lifecycle.durationMs,
            ...(project.lifecycle.setupError
              ? {
                  setupError: sanitizeReportError(project.lifecycle.setupError),
                }
              : {}),
            ...(project.lifecycle.teardownErrors?.length
              ? {
                  teardownErrors:
                    project.lifecycle.teardownErrors.map(sanitizeReportError),
                }
              : {}),
          },
        }
      : {}),
    documents,
    collectionErrors: project.collectionErrors.map((collectionError) => ({
      sourcePath: collectionError.sourcePath,
      error: sanitizeReportError(collectionError.error),
    })),
  };
};

export function collectTestRunReportSources(
  result: RunReportInput,
): TestRunReportSource[] {
  const sources: TestRunReportSource[] = [];
  for (const project of result.projects) {
    for (const document of project.documents) {
      for (const source of document.reportSources ?? [])
        sources.push({ ...source, scopeId: documentReportScope(document) });
      for (const sourcePath of (document.reportPaths ?? []).filter(
        (path) =>
          !document.reportSources?.some((source) => source.sourcePath === path),
      )) {
        sources.push({
          scopeId: documentReportScope(document),
          sourcePath,
        });
      }
    }
    for (const outcome of project.cases) {
      for (const attempt of outcome.attempts ??
        (outcome.run ? [outcome.run] : [])) {
        for (const source of attempt.reportSources ?? [])
          sources.push({ ...source, scopeId: attemptReportScope(attempt) });
        for (const sourcePath of (attempt.reportPaths ?? []).filter(
          (path) =>
            !attempt.reportSources?.some(
              (source) => source.sourcePath === path,
            ),
        )) {
          sources.push({ scopeId: attemptReportScope(attempt), sourcePath });
        }
      }
    }
  }
  return sources;
}

export function buildTestRunReportDump(
  result: RunReportInput,
  index: TestRunReportSourceIndex,
): TestRunReportDump {
  const sourcesByScope = new Map<string, IndexedTestRunReportSource[]>();
  const detailsByScopeAndExecution = new Map<
    string,
    TestRunReportAgentDetail
  >();
  for (const source of index.sources) {
    const scopeSources = sourcesByScope.get(source.scopeId) ?? [];
    scopeSources.push(source);
    sourcesByScope.set(source.scopeId, scopeSources);
    for (const executionId of source.executionIds) {
      detailsByScopeAndExecution.set(
        scopedExecutionKey(source.scopeId, executionId),
        { reportId: source.reportId, executionId },
      );
    }
  }
  const context: ManifestBuildContext = {
    diagnostics: [],
    sourcesByScope,
    detailsByScopeAndExecution,
    tracedScopeByExecution: new Map(),
  };
  for (const error of result.errors ?? []) {
    addDiagnostic(context, {
      level: 'error',
      code: 'run-infrastructure-error',
      message: sanitizeReportError(error).message,
    });
  }
  for (const source of index.sources) {
    if (source.executionIds.length === 0) {
      addDiagnostic(context, {
        level: 'warning',
        code: 'source-without-executions',
        message: `Agent report contains no executions: ${source.sourcePath}`,
        scopeId: source.scopeId,
        sourcePaths: [source.sourcePath],
      });
    }
  }

  const projects = result.projects.map((project) =>
    buildProject(project, context),
  );
  return {
    schemaVersion: 1,
    kind: 'test-runner',
    runId: result.runId,
    status: result.status,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    summary: { ...result.summary },
    metrics: index.metrics,
    projects,
    ...(context.diagnostics.length > 0
      ? { diagnostics: context.diagnostics }
      : {}),
  };
}
