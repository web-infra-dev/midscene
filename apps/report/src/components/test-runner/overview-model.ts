import type { TestRunReportDocument, TestRunReportDump } from '@midscene/core';
import { getIssuePresentation } from './issue-presentation';
import {
  type ReportIssue,
  type ReportIssues,
  collectReportIssues,
  getStepIssues,
} from './issues';
import {
  type RunnerCaseStatus,
  type RunnerCaseView,
  type RunnerProjectView,
  flattenAttemptSteps,
  getCaseSearchMatch,
  groupRunnerProjects,
} from './model';
import { getReportDocuments } from './report-documents';

export type OverviewStatus = 'failed' | 'retry-passed' | 'passed';
export type OverviewSort = 'file' | 'passed-rate' | 'result' | 'duration';
export type OverviewDirection = 'asc' | 'desc';
export interface OverviewSorting {
  sort: OverviewSort;
  direction: OverviewDirection;
}

export interface RunnerFileView {
  key: string;
  document?: TestRunReportDocument;
  sourcePath: string;
  sourceKind: 'yaml' | 'inline' | 'agent';
  cases: RunnerCaseView[];
  status: RunnerCaseStatus;
  passedCount: number;
  failedCount: number;
  retryPassedCount: number;
  notRunCount: number;
  totalCaseCount?: number;
  durationMs?: number;
  retryCount: number;
  issues: ReportIssue[];
  hasScopeError: boolean;
  order: number;
}
export interface OverviewProject extends RunnerProjectView {
  files: RunnerFileView[];
  issues: ReportIssue[];
  hasScopeError: boolean;
}
export interface FileBreakdown {
  item: RunnerFileView;
  cases: RunnerCaseView[];
}
export interface ProjectBreakdown {
  item: OverviewProject;
  files: FileBreakdown[];
}
export interface OverviewFilters {
  query: string;
  /** Empty means All; specific statuses are an OR selection. */
  statuses: readonly OverviewStatus[];
  projectSorts: ReadonlyMap<string, OverviewSorting>;
}
export interface OverviewState extends OverviewFilters {
  expandedFileKeys: Set<string>;
  selectedProjectKey?: string;
  collapsedProjectGroups: ReadonlySet<RunnerCaseStatus>;
}

export function getOverviewProjectStatus(
  item: OverviewProject,
): RunnerCaseStatus {
  return item.project.status === 'failed' ||
    item.hasScopeError ||
    item.files.some((file) => file.hasScopeError) ||
    item.failedCount
    ? 'failed'
    : item.notRunCount
      ? 'not-run'
      : item.retryPassedCount
        ? 'retry-passed'
        : 'passed';
}

export function getOverviewProjectSummary(item: OverviewProject): string {
  const results = [
    [item.passedCount - item.retryPassedCount, 'passed'],
    [item.retryPassedCount, 'retried'],
    [item.failedCount, 'failed'],
    [item.notRunCount, 'not run'],
  ] as const;
  return [
    `${item.cases.length} cases`,
    ...results
      .filter(([count]) => count > 0)
      .map(([count, label]) => `${count} ${label}`),
  ].join(' · ');
}

export function groupOverviewProjects(projects: readonly OverviewProject[]) {
  return (
    [
      ['failed', 'Failed'],
      ['retry-passed', 'Passed after retry'],
      ['passed', 'Passed'],
      ['not-run', 'Not run'],
    ] as const
  ).flatMap(([status, label]) => {
    const items = projects.filter(
      (item) => getOverviewProjectStatus(item) === status,
    );
    return items.length ? [{ status, label, projects: items }] : [];
  });
}

export function selectOverviewProject(
  state: OverviewState,
  key: string,
): OverviewState {
  return { ...state, selectedProjectKey: key, statuses: [] };
}

/** Toggle only visible Files, preserving expansion in other Projects and filters. */
export function toggleOverviewFiles(
  expanded: ReadonlySet<string>,
  visibleKeys: readonly string[],
): Set<string> {
  const next = new Set(expanded);
  const collapse = visibleKeys.every((key) => expanded.has(key));
  for (const key of visibleKeys) {
    if (collapse) next.delete(key);
    else next.add(key);
  }
  return next;
}

export function getSelectedOverviewProject(
  projects: readonly OverviewProject[],
  key?: string,
) {
  return (
    projects.find((item) => item.key === key) ??
    groupOverviewProjects(projects)[0]?.projects[0]
  );
}

export function getOverviewCaseSummary(item: RunnerCaseView) {
  if (item.status === 'passed') return undefined;
  if (item.status === 'not-run')
    return {
      label: 'Case not run',
      message:
        item.testCase.notRunReason ||
        'Open the case to inspect why it did not run.',
      tone: 'muted',
      stepId: undefined,
    };
  const recovered = item.status === 'retry-passed';
  const attempt = recovered
    ? [...item.testCase.attempts]
        .reverse()
        .find((value) => value.status === 'failed')
    : item.finalAttempt;
  const step =
    attempt &&
    flattenAttemptSteps(attempt).find((value) => value.status === 'failed');
  const issue =
    step && getStepIssues(step).find((value) => value.severity === 'error');
  const presentation = issue && getIssuePresentation(issue);
  const scopeError =
    attempt?.hostErrors?.[0]?.error ??
    attempt?.cleanup?.error ??
    attempt?.teardownErrors?.[0];
  const error = issue?.error ?? scopeError;
  return {
    label: `${recovered ? 'Earlier attempt' : (presentation?.title ?? 'Case failed')}${issue && step ? ` · ${step.node}` : ''}`,
    message:
      presentation?.message ??
      error?.cause?.message ??
      error?.message ??
      'Open the case to inspect execution details.',
    tone: recovered ? 'warning' : 'danger',
    stepId: issue ? step?.id : undefined,
  };
}

const counts = (cases: readonly RunnerCaseView[]) => ({
  passedCount: cases.filter(
    (item) => item.status === 'passed' || item.status === 'retry-passed',
  ).length,
  failedCount: cases.filter((item) => item.status === 'failed').length,
  retryPassedCount: cases.filter((item) => item.status === 'retry-passed')
    .length,
  notRunCount: cases.filter((item) => item.status === 'not-run').length,
});
export function toggleOverviewStatus(
  current: readonly OverviewStatus[],
  status: OverviewStatus | 'all',
): OverviewStatus[] {
  if (status === 'all') return [];
  return current.includes(status)
    ? current.filter((value) => value !== status)
    : [...current, status];
}
export const defaultOverviewDirection = (
  sort: OverviewSort,
): OverviewDirection => (sort === 'file' || sort === 'result' ? 'asc' : 'desc');
export function getOverviewProjectSort(
  state: Pick<OverviewFilters, 'projectSorts'>,
  projectKey: string,
): OverviewSorting {
  return (
    state.projectSorts.get(projectKey) ?? { sort: 'file', direction: 'asc' }
  );
}
export function changeOverviewSort(
  state: OverviewState,
  projectKey: string,
  sort: OverviewSort,
): OverviewState {
  const current = getOverviewProjectSort(state, projectKey);
  const projectSorts = new Map(state.projectSorts);
  projectSorts.set(projectKey, {
    sort,
    direction:
      current.sort === sort
        ? current.direction === 'asc'
          ? 'desc'
          : 'asc'
        : defaultOverviewDirection(sort),
  });
  return {
    ...state,
    projectSorts,
  };
}

export function buildOverviewProjects(
  dump: TestRunReportDump,
  cases: RunnerCaseView[],
  reportIssues: ReportIssues = collectReportIssues(dump),
): OverviewProject[] {
  return groupRunnerProjects(dump, cases).map((item) => {
    const { project } = item;
    const projectIssues = reportIssues.others.filter(
      (issue) =>
        issue.projectId === project.projectId &&
        !issue.documentId &&
        !issue.id.startsWith(`collection:${project.projectId}:`),
    );
    const documents = getReportDocuments(project);
    const files: RunnerFileView[] = documents.map((document, index) => {
      const fileCases = item.cases.filter(
        (candidate) => candidate.document.documentId === document.documentId,
      );
      const finalDocument = document.attempts?.at(-1) ?? document;
      const scopeId = finalDocument.documentRunId ?? finalDocument.documentId;
      const issues: ReportIssue[] = [
        ...reportIssues.others
          .filter(
            (issue) =>
              issue.projectId === project.projectId &&
              issue.documentId === document.documentId &&
              issue.scopeId === scopeId,
          )
          .map((issue) => ({
            ...issue,
            title:
              issue.title?.replace(/^Document\b/, 'File') ??
              (issue.severity === 'error'
                ? 'File execution failed'
                : undefined),
            label: issue.label?.replace(
              ' · Document cleanup',
              ' · File cleanup',
            ),
          })),
        ...[...finalDocument.beforeAll, ...finalDocument.afterAll].flatMap(
          (step) =>
            (reportIssues.nodes.get(step.id) ?? []).map((issue) => ({
              ...issue,
              title: issue.title?.replace(/^Document\b/, 'File'),
              label:
                step.phase === 'beforeAll' ? 'File setup' : 'File teardown',
            })),
        ),
      ];
      const stats = counts(fileCases);
      if (
        finalDocument.status === 'failed' &&
        !stats.failedCount &&
        !issues.some((issue) => issue.severity === 'error')
      ) {
        issues.push({
          id: `${scopeId}:file-failed`,
          severity: 'error',
          code: 'FILE_FAILED',
          message:
            'File execution failed. No additional error details were recorded.',
        });
      }
      const hasScopeError = issues.some((issue) => issue.severity === 'error');
      const agentSource =
        (document.documentId === 'agent-report' ||
          document.documentId.endsWith(':agent-report')) &&
        !document.plan &&
        Boolean(document.scopeReportIds?.length);
      return {
        key: `${project.projectId}:file:${document.documentId}`,
        document,
        sourcePath: document.sourcePath,
        sourceKind: agentSource
          ? 'agent'
          : document.sourcePath === '<inline-yaml>'
            ? 'inline'
            : 'yaml',
        cases: fileCases,
        ...stats,
        status:
          document.status === 'failed' || hasScopeError || stats.failedCount
            ? 'failed'
            : stats.notRunCount || document.executionStatus === 'not-run'
              ? 'not-run'
              : stats.retryPassedCount ||
                  document.attempts
                    ?.slice(0, -1)
                    .some((attempt) => attempt.status === 'failed')
                ? 'retry-passed'
                : 'passed',
        totalCaseCount: fileCases.length,
        durationMs: document.durationMs,
        retryCount: Math.max(
          document.attemptIndex ?? 0,
          (document.attempts?.length ?? 1) - 1,
        ),
        issues,
        hasScopeError,
        // Markdown renders project.documents in source order. getReportDocuments
        // appends plan-only files in plan order, so its index preserves both.
        order: index,
      };
    });
    for (const [index, collection] of project.collectionErrors.entries()) {
      const issue = reportIssues.others
        .filter(
          (candidate) =>
            candidate.id === `collection:${project.projectId}:${index}` ||
            candidate.id.startsWith(
              `collection:${project.projectId}:${index}:`,
            ),
        )
        .map((issue) => ({
          ...issue,
          title: 'File collection failed',
          label: `File ${collection.sourcePath}`,
        }));
      const matches = files.filter(
        (file) => file.sourcePath === collection.sourcePath,
      );
      if (matches.length === 1) {
        matches[0].issues.push(...issue);
        matches[0].hasScopeError = true;
        matches[0].status = 'failed';
        continue;
      }
      files.push({
        key: `${project.projectId}:collection:${index}`,
        sourcePath: collection.sourcePath,
        sourceKind:
          collection.sourcePath === '<inline-yaml>' ? 'inline' : 'yaml',
        cases: [],
        status: 'failed',
        ...counts([]),
        retryCount: 0,
        issues: issue,
        hasScopeError: true,
        order: documents.length + index,
      });
    }
    files.sort((a, b) => a.order - b.order);
    return {
      ...item,
      files,
      issues: projectIssues,
      hasScopeError: projectIssues.some((issue) => issue.severity === 'error'),
    };
  });
}

export function createOverviewState(
  projects: readonly OverviewProject[],
): OverviewState {
  return {
    query: '',
    statuses: [],
    projectSorts: new Map(),
    selectedProjectKey: getSelectedOverviewProject(projects)?.key,
    collapsedProjectGroups: new Set(),
    expandedFileKeys: new Set(
      projects.flatMap((item) =>
        item.files
          .filter(
            (file) =>
              file.status === 'failed' || file.status === 'retry-passed',
          )
          .map((file) => file.key),
      ),
    ),
  };
}

const includes = (query: string, values: readonly unknown[]) =>
  values.some(
    (value) =>
      typeof value === 'string' && value.toLocaleLowerCase().includes(query),
  );
const issueMatches = (query: string, issues: readonly ReportIssue[]) =>
  includes(
    query,
    issues.flatMap((issue) => [issue.message, issue.title, issue.error?.code]),
  );
const matchesStatus = (
  item: RunnerCaseView,
  statuses: readonly OverviewStatus[],
) => !statuses.length || statuses.includes(item.status as OverviewStatus);
const rank = (status: RunnerCaseStatus) =>
  ({ failed: 0, 'not-run': 1, 'retry-passed': 2, passed: 3 })[status];
const knownNumber = (
  a: number | undefined,
  b: number | undefined,
  multiplier: number,
) =>
  a === undefined || b === undefined
    ? a === b
      ? 0
      : a === undefined
        ? 1
        : -1
    : multiplier * (a - b);
const passRate = (file: RunnerFileView) =>
  file.totalCaseCount ? file.passedCount / file.totalCaseCount : undefined;
const attentionCount = (file: RunnerFileView) =>
  file.status === 'failed'
    ? file.failedCount +
      file.issues.filter((issue) => issue.severity === 'error').length
    : file.status === 'not-run'
      ? file.notRunCount
      : file.retryPassedCount;

export function filterOverviewProjects(
  projects: readonly OverviewProject[],
  options: OverviewFilters,
): ProjectBreakdown[] {
  const query = options.query.trim().toLocaleLowerCase();
  const failedSelected =
    !options.statuses.length || options.statuses.includes('failed');
  return projects.flatMap((item) => {
    const { sort, direction } = getOverviewProjectSort(options, item.key);
    const multiplier = direction === 'asc' ? 1 : -1;
    const projectMatches =
      !query || includes(query, [item.project.name, item.project.projectId]);
    const projectErrorMatches =
      failedSelected &&
      item.hasScopeError &&
      (projectMatches || issueMatches(query, item.issues));
    const files = item.files.flatMap((file) => {
      const parentMatches =
        projectMatches || includes(query, [file.sourcePath]);
      const scopeErrorMatches =
        failedSelected &&
        (file.hasScopeError || (item.hasScopeError && file.notRunCount > 0)) &&
        (parentMatches ||
          issueMatches(query, file.issues) ||
          projectErrorMatches);
      const cases = file.cases.filter(
        (testCase) =>
          (matchesStatus(testCase, options.statuses) ||
            (scopeErrorMatches && testCase.status === 'not-run')) &&
          (parentMatches ||
            scopeErrorMatches ||
            Boolean(getCaseSearchMatch(testCase, query))),
      );
      if (
        !cases.length &&
        !scopeErrorMatches &&
        !(parentMatches && !options.statuses.length)
      )
        return [];
      cases.sort((a, b) => {
        let comparison = 0;
        if (sort === 'passed-rate')
          comparison =
            multiplier *
            (Number(a.status === 'passed' || a.status === 'retry-passed') -
              Number(b.status === 'passed' || b.status === 'retry-passed'));
        else if (sort === 'result')
          comparison = multiplier * (rank(a.status) - rank(b.status));
        else if (sort === 'duration')
          comparison = knownNumber(
            a.testCase.attempts.length ? a.durationMs : undefined,
            b.testCase.attempts.length ? b.durationMs : undefined,
            multiplier,
          );
        return comparison || a.testCase.caseIndex - b.testCase.caseIndex;
      });
      return [{ item: file, cases }];
    });
    files.sort((a, b) => {
      let comparison = 0;
      if (sort === 'file')
        comparison = multiplier * (a.item.order - b.item.order);
      else if (sort === 'passed-rate')
        comparison = knownNumber(
          passRate(a.item),
          passRate(b.item),
          multiplier,
        );
      else if (sort === 'duration')
        comparison = knownNumber(
          a.item.durationMs,
          b.item.durationMs,
          multiplier,
        );
      else if (sort === 'result')
        comparison =
          multiplier *
          (rank(a.item.status) - rank(b.item.status) ||
            attentionCount(b.item) - attentionCount(a.item));
      return comparison || (sort === 'file' ? 0 : a.item.order - b.item.order);
    });
    return files.length ||
      projectErrorMatches ||
      (!options.statuses.length && projectMatches)
      ? [{ item, files }]
      : [];
  });
}

export function getOverviewStatusCounts(
  projects: readonly OverviewProject[],
  query: string,
) {
  const all = filterOverviewProjects(projects, {
    query,
    statuses: [],
    projectSorts: new Map(),
  });
  const cases = all.flatMap((project) =>
    project.files.flatMap((file) => file.cases),
  );
  return {
    all: cases.length,
    failed: cases.filter((item) => item.status === 'failed').length,
    'retry-passed': cases.filter((item) => item.status === 'retry-passed')
      .length,
    passed: cases.filter((item) => item.status === 'passed').length,
  };
}

export const fileDisplayName = (file: RunnerFileView) =>
  file.sourceKind === 'inline' ? 'Inline YAML' : file.sourcePath;
export const projectDisplayName = (item: OverviewProject) =>
  item.project.name && item.project.name !== 'legacy-yaml'
    ? item.project.name
    : 'YAML execution';
export function fileAttention(file: RunnerFileView): string {
  const document = file.document?.attempts?.at(-1) ?? file.document;
  const scopeFailure = !file.hasScopeError
    ? ''
    : file.issues.some((issue) => issue.id.startsWith('collection:'))
      ? 'Collection failed'
      : document?.beforeAll.some((step) => step.status === 'failed') ||
          document?.hostErrors?.some((issue) => issue.phase === 'setup')
        ? 'Setup failed'
        : document?.afterAll.some((step) => step.status === 'failed') ||
            document?.teardownErrors?.length ||
            document?.cleanup?.status === 'failed'
          ? 'Teardown failed'
          : `${file.issues.filter((issue) => issue.severity === 'error').length} file error${file.issues.filter((issue) => issue.severity === 'error').length === 1 ? '' : 's'}`;
  return (
    [
      file.failedCount && `${file.failedCount} failed`,
      scopeFailure,
      file.notRunCount && `${file.notRunCount} not run`,
      file.retryPassedCount && `${file.retryPassedCount} retried`,
      file.retryCount &&
        `${file.retryCount} file ${file.retryCount === 1 ? 'retry' : 'retries'}`,
    ]
      .filter(Boolean)
      .join(' · ') || '-'
  );
}
