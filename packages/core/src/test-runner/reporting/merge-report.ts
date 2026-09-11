import type {
  TestRunReportDocument,
  TestRunReportDump,
  TestRunReportMetrics,
  TestRunReportStep,
} from '../../test-run-report';
import type { ReportFileAttributes } from '../../types';

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
  Partial<Pick<TestRunReportDump, 'startedAt' | 'endedAt' | 'diagnostics'>> {
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
    const scopeReports = (reportIds: string[] | undefined) =>
      reportIds?.length ? [source.reportId] : reportIds;
    const step = (value: TestRunReportStep): TestRunReportStep => ({
      ...value,
      id: id(value.id),
      ...(value.agentDetails
        ? {
            agentDetails: value.agentDetails.map((detail) => ({
              ...detail,
              reportId: source.reportId,
            })),
          }
        : {}),
    });
    const documentScope = <
      T extends Omit<TestRunReportDocument, 'cases' | 'attempts'>,
    >(
      value: T,
    ): T => ({
      ...value,
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
        documents: project.documents.map((document) => ({
          ...documentScope(document),
          ...(document.attempts
            ? { attempts: document.attempts.map(documentScope) }
            : {}),
          cases: document.cases.map((testCase) => ({
            ...testCase,
            caseId: id(testCase.caseId),
            attempts: testCase.attempts.map((attempt) => ({
              ...attempt,
              attemptId: id(attempt.attemptId),
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
        ...(diagnostic.scopeId ? { scopeId: id(diagnostic.scopeId) } : {}),
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
    metrics,
    projects: dumps.flatMap((dump) => dump.projects),
    ...(diagnostics.length ? { diagnostics } : {}),
  };
}
