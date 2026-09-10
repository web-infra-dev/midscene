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
} from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import type {
  TestProjectCaseRunResult,
  TestProjectRunResult,
} from '../cli/types';
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

const warnReport = getDebug('test-runner:report-assembler', {
  console: true,
});

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
  warnedDiagnostics: Set<string>;
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
  const key = JSON.stringify([
    diagnostic.code,
    diagnostic.scopeId,
    diagnostic.executionId,
  ]);
  if (!context.warnedDiagnostics.has(key)) {
    context.warnedDiagnostics.add(key);
    warnReport(diagnostic.message);
  }
};

const buildStep = (
  step: StepRunResult,
  scopeId: string,
  context: ManifestBuildContext,
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

  const prompt =
    typeof (step.input as { prompt?: unknown } | undefined)?.prompt === 'string'
      ? (step.input as { prompt: string }).prompt
      : undefined;
  return {
    id: `${scopeId}:${step.phase}:${step.stepIndex}`,
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

const buildAttempt = (
  attempt: CaseRunResult,
  context: ManifestBuildContext,
): TestRunReportAttempt => ({
  attemptId: attempt.runId,
  attemptIndex: attempt.attemptIndex,
  status: attempt.status,
  startedAt: attempt.startedAt,
  endedAt: attempt.endedAt,
  durationMs: attempt.durationMs,
  beforeEach: attempt.beforeEach.map((step) =>
    buildStep(step, attempt.runId, context),
  ),
  steps: attempt.steps.map((step) => buildStep(step, attempt.runId, context)),
  afterEach: attempt.afterEach.map((step) =>
    buildStep(step, attempt.runId, context),
  ),
  ...(attempt.teardownErrors?.length
    ? { teardownErrors: attempt.teardownErrors.map(sanitizeReportError) }
    : {}),
  ...(reportSourcesForScope(context, attempt.runId).length > 0
    ? {
        scopeReportIds: reportSourcesForScope(context, attempt.runId).map(
          (source) => source.reportId,
        ),
      }
    : {}),
});

const buildCase = (
  outcome: TestProjectCaseRunResult,
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

const buildDocument = (
  documentId: string,
  document: WorkflowDocumentRunResult | undefined,
  cases: readonly TestProjectCaseRunResult[],
  context: ManifestBuildContext,
): TestRunReportDocument => {
  const sourcePath =
    document?.sourcePath ?? cases[0]?.sourcePath ?? '<unknown>';
  const status =
    document?.status ??
    (cases.some((item) => item.status !== 'success') ? 'failed' : 'success');
  return {
    documentId,
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
      buildStep(step, document!.documentRunId, context),
    ),
    cases: cases.map((outcome) => buildCase(outcome, context)),
    afterAll: (document?.afterAll ?? []).map((step) =>
      buildStep(step, document!.documentRunId, context),
    ),
    ...(document?.teardownErrors?.length
      ? { teardownErrors: document.teardownErrors.map(sanitizeReportError) }
      : {}),
    ...(document &&
    reportSourcesForScope(context, document.documentRunId).length > 0
      ? {
          scopeReportIds: reportSourcesForScope(
            context,
            document.documentRunId,
          ).map((source) => source.reportId),
        }
      : {}),
  };
};

const buildProject = (
  project: TestProjectRunResult['projects'][number],
  context: ManifestBuildContext,
): TestRunReportProject => {
  const documentById = new Map(
    project.documents.map((document) => [document.documentId, document]),
  );
  const casesByDocumentId = new Map<string, TestProjectCaseRunResult[]>();
  for (const outcome of project.cases) {
    const current = casesByDocumentId.get(outcome.documentId) ?? [];
    current.push(outcome);
    casesByDocumentId.set(outcome.documentId, current);
  }
  const documentIds = new Set([
    ...project.documents.map((document) => document.documentId),
    ...project.cases.map((outcome) => outcome.documentId),
  ]);

  return {
    projectId: project.projectId,
    name: project.name,
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
    documents: [...documentIds].map((documentId) =>
      buildDocument(
        documentId,
        documentById.get(documentId),
        casesByDocumentId.get(documentId) ?? [],
        context,
      ),
    ),
    collectionErrors: project.collectionErrors.map((collectionError) => ({
      sourcePath: collectionError.sourcePath,
      error: sanitizeReportError(collectionError.error),
    })),
  };
};

export function collectTestRunReportSources(
  result: TestProjectRunResult,
): TestRunReportSource[] {
  const sources: TestRunReportSource[] = [];
  for (const project of result.projects) {
    for (const document of project.documents) {
      for (const sourcePath of document.reportPaths ?? []) {
        sources.push({
          scopeId: document.documentRunId,
          sourcePath,
        });
      }
    }
    for (const outcome of project.cases) {
      for (const attempt of outcome.attempts ??
        (outcome.run ? [outcome.run] : [])) {
        for (const sourcePath of attempt.reportPaths ?? []) {
          sources.push({ scopeId: attempt.runId, sourcePath });
        }
      }
    }
  }
  return sources;
}

export function buildTestRunReportDump(
  result: TestProjectRunResult,
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
    warnedDiagnostics: new Set(),
  };
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
