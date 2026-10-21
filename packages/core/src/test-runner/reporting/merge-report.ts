import type {
  TestRunReportCleanup,
  TestRunReportDocument,
  TestRunReportDump,
  TestRunReportError,
  TestRunReportHostError,
  TestRunReportMetrics,
  TestRunReportOperationReference,
  TestRunReportStep,
} from '../../test-run-report';
import type { ReportFileAttributes } from '../../types';
import { sumTestRunReportMetrics } from './metrics';

function remapError(
  error: TestRunReportError,
  id: (value: string) => string,
): TestRunReportError {
  const remapReferences = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return value;
    const result = { ...value } as Record<string, unknown>;
    for (const key of [
      'blockedByStepId',
      'stepId',
      'scopeId',
      'caseId',
      'runId',
      'documentId',
      'documentRunId',
    ])
      if (typeof result[key] === 'string') result[key] = id(result[key]);
    return result;
  };
  let details = error.details;
  // Only framework-owned details contain report links. Do not rewrite matching
  // property names in custom errors or arbitrary nested business data.
  if (
    details &&
    [
      'RESOURCE_RECOVERY_TIMEOUT',
      'RESOURCE_CLEANUP_DEFERRED',
      'NODE_SCOPE_TEARDOWN_ERROR',
      'REPORT_SNAPSHOT_FAILED',
      'CASE_EXECUTION_FAILED',
      'WORKFLOW_DOCUMENT_EXECUTION_FAILED',
    ].includes(error.code ?? '')
  ) {
    const value = remapReferences(details.value);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const mapped = value as Record<string, unknown>;
      for (const key of ['blockingOperations', 'diagnostics'])
        if (Array.isArray(mapped[key]))
          mapped[key] = mapped[key].map(remapReferences);
    }
    details = { ...details, value };
  }
  return {
    ...error,
    ...(details ? { details } : {}),
    ...(error.cause ? { cause: remapError(error.cause, id) } : {}),
    ...(error.errors
      ? { errors: error.errors.map((item) => remapError(item, id)) }
      : {}),
  };
}

export interface MergeTestRunReportSource {
  reportId: string;
  sourcePath: string;
  attributes: ReportFileAttributes;
  dump?: TestRunReportDump;
  timing?: { startedAt: string; endedAt: string; durationMs: number };
}

function agentReportAsTestRun(
  source: MergeTestRunReportSource,
): Pick<TestRunReportDump, 'status' | 'summary' | 'projects'> &
  Partial<
    Pick<
      TestRunReportDump,
      'startedAt' | 'endedAt' | 'diagnostics' | 'operationLogs'
    >
  > {
  const { attributes, reportId } = source;
  const status =
    attributes.testStatus === 'skipped'
      ? 'not-run'
      : attributes.testStatus === 'passed'
        ? 'success'
        : 'failed';
  const failed = status === 'failed';
  return {
    status: failed ? 'failed' : 'success',
    ...source.timing,
    summary: {
      total: 1,
      passed: status === 'success' ? 1 : 0,
      failed: failed ? 1 : 0,
      notRun: status === 'not-run' ? 1 : 0,
      filtered: 0,
      collectionErrors: 0,
      documentFailures: 0,
      projectFailures: 0,
    },
    projects: [
      {
        projectId: 'agent-report',
        name: attributes.testTitle,
        platform: 'agent',
        status: failed ? 'failed' : 'success',
        retry: 0,
        collectionErrors: [],
        documents: [
          {
            documentId: 'agent-report',
            sourcePath: source.sourcePath,
            status: failed ? 'failed' : 'success',
            beforeAll: [],
            afterAll: [],
            scopeReportIds: [reportId],
            cases: [
              {
                caseId: attributes.testId,
                name: attributes.testTitle,
                caseIndex: 0,
                status,
                attempts:
                  status === 'not-run' || !source.timing
                    ? []
                    : [
                        {
                          attemptId: 'agent-report',
                          attemptIndex: 0,
                          status,
                          ...source.timing,
                          beforeEach: [],
                          steps: [],
                          afterEach: [],
                          scopeReportIds: [reportId],
                        },
                      ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function retainHostFailure(
  source: MergeTestRunReportSource,
): TestRunReportDump | undefined {
  const dump = source.dump;
  if (
    !dump ||
    dump.status === 'failed' ||
    !['failed', 'timedOut', 'interrupted'].includes(
      source.attributes.testStatus,
    )
  )
    return dump;

  const message = `Host test "${source.attributes.testTitle}" finished with status "${source.attributes.testStatus}".`;
  const projectIndex = dump.projects.length - 1;
  const project = dump.projects[projectIndex];
  const documentIndex = (project?.documents.length ?? 0) - 1;
  const document = project?.documents[documentIndex];
  const afterHost = <
    T extends Omit<TestRunReportDocument, 'cases' | 'attempts'>,
  >(
    value: T,
  ): T => ({
    ...value,
    status: 'failed',
    afterAll: [
      ...value.afterAll,
      {
        id: `${value.documentRunId ?? value.documentId}:host-result`,
        phase: 'afterAll',
        stepIndex: value.afterAll.length,
        node: 'runner:host-result',
        status: 'failed',
        continuedAfterError: false,
        startedAt: value.endedAt ?? dump.endedAt,
        endedAt: value.endedAt ?? dump.endedAt,
        durationMs: 0,
        error: { name: 'HostTestError', message },
      },
    ],
  });
  // The enclosing test can fail after YAML succeeds. Record that outcome at
  // the file boundary instead of changing successful actions or Case attempts.
  return {
    ...dump,
    status: 'failed',
    summary: {
      ...dump.summary,
      ...(document
        ? { documentFailures: dump.summary.documentFailures + 1 }
        : { projectFailures: dump.summary.projectFailures + 1 }),
    },
    projects: dump.projects.map((item, index) =>
      index !== projectIndex
        ? item
        : {
            ...item,
            status: 'failed',
            documents: item.documents.map((value, index) =>
              index !== documentIndex
                ? value
                : {
                    ...afterHost(value),
                    ...(value.attempts
                      ? {
                          attempts: value.attempts.map((attempt, index) =>
                            index === value.attempts!.length - 1
                              ? afterHost(attempt)
                              : attempt,
                          ),
                        }
                      : {}),
                  },
            ),
          },
    ),
    diagnostics: [
      ...(dump.diagnostics ?? []),
      {
        level: 'error',
        code: 'run-infrastructure-error',
        message,
      },
    ],
  };
}

export function mergeTestRunReportDumps(
  sources: readonly MergeTestRunReportSource[],
  metrics: TestRunReportMetrics,
  runId: string,
  rawExecutionMetrics?: Record<string, TestRunReportMetrics>,
): TestRunReportDump {
  const dumps = sources.map((source) => {
    if (
      source.dump &&
      (!Number.isFinite(Date.parse(source.dump.startedAt)) ||
        !Number.isFinite(Date.parse(source.dump.endedAt)) ||
        Date.parse(source.dump.endedAt) < Date.parse(source.dump.startedAt))
    )
      throw new Error(
        `Invalid execution timestamps in Midscene Test report: ${source.sourcePath}`,
      );
    const dump = retainHostFailure(source) ?? agentReportAsTestRun(source);
    const id = (value: string) => `${source.reportId}:${value}`;
    const error = (value: TestRunReportError) => remapError(value, id);
    const scopeErrors = <
      T extends {
        setupError?: TestRunReportError;
        teardownErrors?: TestRunReportError[];
        hostErrors?: TestRunReportHostError[];
      },
    >(
      value: T,
    ): T => ({
      ...value,
      ...(value.setupError ? { setupError: error(value.setupError) } : {}),
      ...(value.teardownErrors
        ? { teardownErrors: value.teardownErrors.map(error) }
        : {}),
      ...(value.hostErrors
        ? {
            hostErrors: value.hostErrors.map((host) => ({
              ...host,
              error: error(host.error),
            })),
          }
        : {}),
    });
    const reference = (
      value: TestRunReportOperationReference,
    ): TestRunReportOperationReference => ({
      ...value,
      ...(value.stepId ? { stepId: id(value.stepId) } : {}),
      ...(value.scopeId ? { scopeId: id(value.scopeId) } : {}),
    });
    const cleanup = (value: TestRunReportCleanup | undefined) =>
      value
        ? {
            ...value,
            ...(value.error ? { error: error(value.error) } : {}),
            ...(value.blockingOperations
              ? { blockingOperations: value.blockingOperations.map(reference) }
              : {}),
          }
        : undefined;
    const scopeReports = (reportIds: string[] | undefined) =>
      reportIds?.length ? [source.reportId] : reportIds;
    const step = (value: TestRunReportStep): TestRunReportStep => {
      const result: TestRunReportStep = {
        ...value,
        id: id(value.id),
        ...(value.error ? { error: error(value.error) } : {}),
        ...(value.evidenceCollection
          ? {
              evidenceCollection: {
                ...value.evidenceCollection,
                ...(value.evidenceCollection.errors
                  ? { errors: value.evidenceCollection.errors.map(error) }
                  : {}),
              },
            }
          : {}),
        ...(value.operations
          ? {
              operations: {
                ...value.operations,
                events: value.operations.events.map((event) => ({
                  ...event,
                  ...(event.error ? { error: error(event.error) } : {}),
                  ...(event.stepId ? { stepId: id(event.stepId) } : {}),
                  ...(event.scopeId ? { scopeId: id(event.scopeId) } : {}),
                  ...(event.blockingOperations
                    ? {
                        blockingOperations:
                          event.blockingOperations.map(reference),
                      }
                    : {}),
                })),
              },
            }
          : {}),
        ...(value.agentDetails
          ? {
              agentDetails: value.agentDetails.map((detail) => ({
                ...detail,
                reportId: source.reportId,
              })),
            }
          : {}),
      };
      if (result.status === 'not-run' && result.blockedBy)
        result.blockedBy = id(result.blockedBy);
      return result;
    };
    const documentScope = <
      T extends Omit<TestRunReportDocument, 'cases' | 'attempts'>,
    >(
      value: T,
    ): T => ({
      ...scopeErrors(value),
      ...(value.cleanup ? { cleanup: cleanup(value.cleanup) } : {}),
      ...(value.pendingOperations
        ? { pendingOperations: value.pendingOperations.map(reference) }
        : {}),
      documentId: id(value.documentId),
      ...(value.logicalDocumentId
        ? { logicalDocumentId: id(value.logicalDocumentId) }
        : {}),
      ...(value.documentRunId
        ? { documentRunId: id(value.documentRunId) }
        : {}),
      beforeAll: value.beforeAll.map(step),
      afterAll: value.afterAll.map(step),
      scopeReportIds: scopeReports(value.scopeReportIds),
    });
    // A file can already contain a merged run. Namespace hierarchy IDs while
    // keeping execution IDs stable: the latter also deduplicate shared snapshots.
    return {
      ...dump,
      projects: dump.projects.map((project) => ({
        ...project,
        projectId: id(project.projectId),
        collectionErrors: project.collectionErrors.map((item) => ({
          ...item,
          error: error(item.error),
        })),
        ...(project.lifecycle
          ? {
              lifecycle: {
                ...scopeErrors(project.lifecycle),
                ...(project.lifecycle.cleanup
                  ? { cleanup: cleanup(project.lifecycle.cleanup) }
                  : {}),
                ...(project.lifecycle.pendingOperations
                  ? {
                      pendingOperations:
                        project.lifecycle.pendingOperations.map(reference),
                    }
                  : {}),
              },
            }
          : {}),
        documents: project.documents.map((document) => ({
          ...documentScope(document),
          ...(document.attempts
            ? { attempts: document.attempts.map(documentScope) }
            : {}),
          cases: document.cases.map((testCase) => ({
            ...testCase,
            caseId: id(testCase.caseId),
            attempts: testCase.attempts.map((attempt) => ({
              ...scopeErrors(attempt),
              attemptId: id(attempt.attemptId),
              ...(attempt.cleanup ? { cleanup: cleanup(attempt.cleanup) } : {}),
              ...(attempt.pendingOperations
                ? {
                    pendingOperations: attempt.pendingOperations.map(reference),
                  }
                : {}),
              beforeEach: attempt.beforeEach.map(step),
              steps: attempt.steps.map(step),
              afterEach: attempt.afterEach.map(step),
              scopeReportIds: scopeReports(attempt.scopeReportIds),
            })),
          })),
        })),
      })),
      diagnostics: dump.diagnostics?.map((diagnostic) => ({
        ...diagnostic,
        ...(diagnostic.error ? { error: error(diagnostic.error) } : {}),
        ...(diagnostic.scopeId ? { scopeId: id(diagnostic.scopeId) } : {}),
        ...(diagnostic.stepId ? { stepId: id(diagnostic.stepId) } : {}),
      })),
    };
  });
  // A report without recorded timestamps contributes outcomes, not the time
  // at which an unrelated merge command happened to run.
  const recordedTimes = dumps.flatMap((dump) =>
    dump.startedAt && dump.endedAt
      ? [{ start: Date.parse(dump.startedAt), end: Date.parse(dump.endedAt) }]
      : [],
  );
  if (!recordedTimes.length)
    throw new Error(
      'Cannot merge Midscene Test reports without recorded execution timestamps.',
    );
  const startedAt = new Date(
    Math.min(...recordedTimes.map((time) => time.start)),
  ).toISOString();
  const endedAt = new Date(
    Math.max(...recordedTimes.map((time) => time.end)),
  ).toISOString();
  const summary = {
    total: 0,
    passed: 0,
    failed: 0,
    notRun: 0,
    filtered: 0,
    collectionErrors: 0,
    documentFailures: 0,
    projectFailures: 0,
  };
  for (const dump of dumps) {
    for (const key of Object.keys(summary) as (keyof typeof summary)[])
      summary[key] += dump.summary[key];
  }
  const diagnostics = dumps.flatMap((dump) => dump.diagnostics ?? []);
  const executionMetrics: Record<string, TestRunReportMetrics> = Object.assign(
    {},
    rawExecutionMetrics,
    ...sources.map((source) => source.dump?.executionMetrics),
  );
  if (rawExecutionMetrics)
    metrics = sumTestRunReportMetrics([
      metrics,
      ...Object.entries(executionMetrics)
        .filter(([id]) => !rawExecutionMetrics[id])
        .map(([, value]) => value),
    ]);
  else if (sources.every((source) => source.dump?.executionMetrics))
    metrics = sumTestRunReportMetrics(Object.values(executionMetrics));
  const collections = sources.flatMap((source) =>
    source.dump ? [source.dump.metrics.collection] : [],
  );
  const incomplete =
    metrics.collection?.status === 'partial' ||
    metrics.collection?.status === 'unknown' ||
    collections.some((collection) => collection?.status !== 'complete');
  const collection = {
    status: (incomplete
      ? metrics.modelCallCount > 0 ||
        collections.some(
          (value) =>
            value?.status === 'complete' || value?.status === 'partial',
        )
        ? 'partial'
        : 'unknown'
      : 'complete') as 'complete' | 'partial' | 'unknown',
    expectedExecutionCount: collections.reduce(
      (count, value) => count + (value?.expectedExecutionCount ?? 0),
      0,
    ),
    capturedExecutionCount: collections.reduce(
      (count, value) => count + (value?.capturedExecutionCount ?? 0),
      0,
    ),
    reasons: [
      ...(metrics.collection?.reasons ?? []),
      ...new Set(
        collections.flatMap(
          (value) =>
            value?.reasons ?? [
              'Model metric collection status is unavailable in a source report.',
            ],
        ),
      ),
    ],
    fields: Object.fromEntries(
      (['modelCallCount', 'modelTimeMs', 'totalTokens'] as const).map(
        (field) => {
          const states = [
            ...collections.map(
              (value) => value?.fields?.[field] ?? value?.status ?? 'unknown',
            ),
            ...(metrics.collection?.fields
              ? [metrics.collection.fields[field]]
              : []),
          ];
          return [
            field,
            states.every((state) => state === 'complete')
              ? 'complete'
              : states.every((state) => state === 'unknown')
                ? 'unknown'
                : 'partial',
          ];
        },
      ),
    ) as NonNullable<NonNullable<TestRunReportMetrics['collection']>['fields']>,
  };
  return {
    schemaVersion: 1,
    kind: 'test-runner',
    runId,
    status: dumps.some((dump) => dump.status === 'failed')
      ? 'failed'
      : 'success',
    startedAt,
    endedAt,
    durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
    summary,
    metrics: { ...metrics, collection },
    ...(Object.keys(executionMetrics).length ? { executionMetrics } : {}),
    projects: dumps.flatMap((dump) => dump.projects),
    ...(dumps.some((dump) => dump.operationLogs?.length)
      ? { operationLogs: dumps.flatMap((dump) => dump.operationLogs ?? []) }
      : {}),
    ...(diagnostics.length ? { diagnostics } : {}),
  };
}
