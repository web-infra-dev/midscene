import type {
  TestRunReportAgentDetail,
  TestRunReportAttempt,
  TestRunReportCase,
  TestRunReportDocument,
  TestRunReportDump,
  TestRunReportProject,
  TestRunReportStep,
} from '@midscene/core';
import type { PlaywrightTasks } from '../../types';

export type RunnerCaseStatus = 'passed' | 'retry-passed' | 'failed' | 'not-run';

export interface RunnerCaseView {
  key: string;
  project: TestRunReportProject;
  document: TestRunReportDocument;
  testCase: TestRunReportCase;
  status: RunnerCaseStatus;
  durationMs: number;
  firstPass: boolean;
  retryCount: number;
  finalAttempt?: TestRunReportAttempt;
}

export interface RunnerCaseSearchMatch {
  label: string;
  snippet: string;
}

export interface RunnerHealthStats {
  executed: number;
  firstPassCount: number;
  retryPassedCount: number;
  finalPassRate: number;
  firstPassRate: number;
}

export interface RunnerProjectView {
  key: string;
  project: TestRunReportProject;
  cases: RunnerCaseView[];
  health: RunnerHealthStats;
  passedCount: number;
  failedCount: number;
  retryPassedCount: number;
  notRunCount: number;
  durationMs?: number;
}

export type RunnerBreakdownStatus = 'all' | 'attention' | RunnerCaseStatus;

export type RunnerBreakdownSort = 'attention' | 'issues' | 'duration' | 'name';

export interface RunnerProjectBreakdownView {
  item: RunnerProjectView;
  cases: RunnerCaseView[];
}

export const getDefaultExpandedProjectKeys = (
  projects: readonly RunnerProjectBreakdownView[],
): Set<string> =>
  new Set(
    projects
      .filter(({ item }) => item.failedCount > 0)
      .map(({ item }) => item.key),
  );

export interface RunnerTimelineSegment {
  key: string;
  label: string;
  kind: 'setup' | 'test' | 'teardown';
  durationMs: number;
  offsetPercent: number;
  widthPercent: number;
}

export interface RunnerTimelineLane {
  projectId: string;
  projectName: string;
  status: TestRunReportProject['status'];
  segments: RunnerTimelineSegment[];
}

interface ScreenshotLike {
  base64: string;
  capturedAt?: number;
  sourceRef?: { id?: string };
}

export interface RunnerVisualFrame {
  key: string;
  reportId: string;
  executionId: string;
  label: string;
  capturedAt?: number;
  screenshot: ScreenshotLike;
}

export interface RunnerPositionedVisualFrame {
  frame: RunnerVisualFrame;
  offsetMs: number;
  offsetPercent: number;
  stepId?: string;
}

export interface RunnerVisualStoryItem {
  key: string;
  step: TestRunReportStep;
  label: string;
  frame?: RunnerVisualFrame;
}

export interface RunnerVisualIndex {
  framesByDetail: Map<string, RunnerVisualFrame[]>;
  reportsById: Map<string, PlaywrightTasks>;
  loadedReportIds: Set<string>;
  firstCapturedAt?: number;
  lastCapturedAt?: number;
}

const detailKey = (reportId: string, executionId: string): string =>
  `${reportId}\u0000${executionId}`;

const timestamp = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const flattenAttemptSteps = (
  attempt: TestRunReportAttempt,
): TestRunReportStep[] => [
  ...attempt.beforeEach,
  ...attempt.steps,
  ...attempt.afterEach,
];

export const getCaseStatus = (
  testCase: TestRunReportCase,
): RunnerCaseStatus => {
  if (testCase.status === 'not-run') return 'not-run';
  if (testCase.status === 'failed') return 'failed';
  return testCase.attempts.length > 1 ||
    testCase.attempts[0]?.status === 'failed'
    ? 'retry-passed'
    : 'passed';
};

const getCaseDuration = (testCase: TestRunReportCase): number => {
  const firstAttempt = testCase.attempts[0];
  const lastAttempt = testCase.attempts.at(-1);
  const startedAt = timestamp(firstAttempt?.startedAt);
  const endedAt = timestamp(lastAttempt?.endedAt);
  if (
    startedAt !== undefined &&
    endedAt !== undefined &&
    endedAt >= startedAt
  ) {
    return endedAt - startedAt;
  }
  return testCase.attempts.reduce(
    (total, attempt) => total + attempt.durationMs,
    0,
  );
};

export const flattenRunnerCases = (
  dump: TestRunReportDump,
): RunnerCaseView[] => {
  const result: RunnerCaseView[] = [];
  for (const project of dump.projects) {
    for (const document of project.documents) {
      for (const testCase of document.cases) {
        const status = getCaseStatus(testCase);
        result.push({
          key: `${project.projectId}:${document.documentId}:${testCase.caseId}`,
          project,
          document,
          testCase,
          status,
          durationMs: getCaseDuration(testCase),
          firstPass: status === 'passed',
          retryCount: Math.max(0, testCase.attempts.length - 1),
          finalAttempt: testCase.attempts.at(-1),
        });
      }
    }
  }
  return result;
};

export const getRunnerHealth = (
  cases: readonly RunnerCaseView[],
): RunnerHealthStats => {
  const executedCases = cases.filter((item) => item.status !== 'not-run');
  const firstPassCount = executedCases.filter((item) => item.firstPass).length;
  const retryPassedCount = executedCases.filter(
    (item) => item.status === 'retry-passed',
  ).length;
  const finalPassed = executedCases.filter(
    (item) => item.status === 'passed' || item.status === 'retry-passed',
  ).length;
  return {
    executed: executedCases.length,
    firstPassCount,
    retryPassedCount,
    finalPassRate:
      executedCases.length === 0 ? 0 : finalPassed / executedCases.length,
    firstPassRate:
      executedCases.length === 0 ? 0 : firstPassCount / executedCases.length,
  };
};

export const groupRunnerProjects = (
  dump: TestRunReportDump,
  cases = flattenRunnerCases(dump),
): RunnerProjectView[] =>
  dump.projects.map((project) => {
    const projectCases = cases.filter(
      (item) => item.project.projectId === project.projectId,
    );
    const health = getRunnerHealth(projectCases);
    return {
      key: project.projectId,
      project,
      cases: projectCases,
      health,
      passedCount: projectCases.filter(
        (item) => item.status === 'passed' || item.status === 'retry-passed',
      ).length,
      failedCount: projectCases.filter((item) => item.status === 'failed')
        .length,
      retryPassedCount: projectCases.filter(
        (item) => item.status === 'retry-passed',
      ).length,
      notRunCount: projectCases.filter((item) => item.status === 'not-run')
        .length,
      durationMs: project.lifecycle?.durationMs,
    };
  });

export const getStepDisplayName = (step: TestRunReportStep): string =>
  step.title?.trim() || step.output?.summary?.trim() || step.node;

export const getCaseStory = (
  testCase: TestRunReportCase,
  attempt = testCase.attempts.at(-1),
): string[] => {
  if (!attempt) return [];
  const primarySteps = attempt.steps.length
    ? attempt.steps
    : flattenAttemptSteps(attempt);
  const labels: string[] = [];
  for (const step of primarySteps) {
    const label = getStepDisplayName(step);
    if (labels.at(-1) !== label) labels.push(label);
  }
  return labels.slice(0, 5);
};

export const getCaseFailure = (
  testCase: TestRunReportCase,
): TestRunReportStep | undefined => {
  for (const attempt of [...testCase.attempts].reverse()) {
    const failed = flattenAttemptSteps(attempt).find(
      (step) => step.status === 'failed',
    );
    if (failed) return failed;
  }
  return undefined;
};

const searchableValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

const searchSnippet = (value: string, query: string): string => {
  const matchIndex = value.toLocaleLowerCase().indexOf(query);
  if (matchIndex < 0 || value.length <= 150) return value;
  const start = Math.max(0, matchIndex - 48);
  const end = Math.min(value.length, matchIndex + query.length + 84);
  return `${start > 0 ? '…' : ''}${value.slice(start, end)}${
    end < value.length ? '…' : ''
  }`;
};

/**
 * Search every field that can identify a case or explain its execution.
 * This deliberately includes failed retry attempts and debug-only identifiers,
 * rather than mirroring the compact story shown in the list.
 */
export const getCaseSearchMatch = (
  item: RunnerCaseView,
  query: string,
): RunnerCaseSearchMatch | undefined => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return undefined;

  const entries: Array<[label: string, value: unknown]> = [
    ['Case name', item.testCase.name],
    ['Case ID', item.testCase.caseId],
    ['Case status', item.status],
    ['Not-run reason', item.testCase.notRunReason ?? ''],
    ['Project', item.project.name],
    ['Project ID', item.project.projectId],
    ['Platform', item.project.platform],
    ['Source file', item.document.sourcePath],
    ['Document ID', item.document.documentId],
  ];
  const documentSteps = [
    ...item.document.beforeAll,
    ...item.testCase.attempts.flatMap(flattenAttemptSteps),
    ...item.document.afterAll,
  ];

  for (const attempt of item.testCase.attempts) {
    entries.push(
      ['Attempt ID', attempt.attemptId],
      ['Attempt status', attempt.status],
      ['Attempt started', attempt.startedAt],
      ['Attempt ended', attempt.endedAt],
    );
  }
  for (const step of documentSteps) {
    entries.push(
      ['Step node', step.node],
      ['Step title', step.title ?? ''],
      ['Step ID', step.id],
      ['Step phase', step.phase],
      ['Step status', step.status],
      ['Step summary', step.output?.summary ?? ''],
      ['Error name', step.error?.name ?? ''],
      ['Error code', step.error?.code ?? ''],
      ['Error message', step.error?.message ?? ''],
      ['Error details', step.error?.details?.value ?? ''],
      ['Step input', step.input?.value ?? ''],
      ['Step output', step.output?.data?.value ?? ''],
      ['Trace diagnostic', step.agentDetailDiagnostic ?? ''],
    );
    for (const detail of step.agentDetails ?? []) {
      entries.push(
        ['Report ID', detail.reportId],
        ['Execution ID', detail.executionId],
      );
    }
  }

  for (const [label, rawValue] of entries) {
    const value = searchableValue(rawValue);
    if (value.toLocaleLowerCase().includes(normalizedQuery)) {
      return {
        label,
        snippet: searchSnippet(value, normalizedQuery),
      };
    }
  }
  return undefined;
};

const matchesBreakdownStatus = (
  item: RunnerCaseView,
  status: RunnerBreakdownStatus,
): boolean => {
  if (status === 'all') return true;
  if (status === 'attention') return item.status !== 'passed';
  return item.status === status;
};

const breakdownCaseSorter = (
  sort: RunnerBreakdownSort,
): ((a: RunnerCaseView, b: RunnerCaseView) => number) => {
  if (sort === 'duration') {
    return (a, b) => b.durationMs - a.durationMs;
  }
  if (sort === 'name') {
    return (a, b) => a.testCase.name.localeCompare(b.testCase.name);
  }
  return (a, b) =>
    statusSortWeight[a.status] - statusSortWeight[b.status] ||
    b.durationMs - a.durationMs;
};

const projectIssueCount = (item: RunnerProjectView): number =>
  item.failedCount + item.retryPassedCount + item.notRunCount;

/**
 * Build the compact Overview tree without mutating the full Project model.
 * Project health always reflects the whole run while the child Case list may
 * be narrowed by the user's status or search filters.
 */
export const filterAndSortRunnerProjectBreakdown = (
  projects: readonly RunnerProjectView[],
  options: {
    query: string;
    status: RunnerBreakdownStatus;
    sort: RunnerBreakdownSort;
  },
): RunnerProjectBreakdownView[] => {
  const normalizedQuery = options.query.trim().toLocaleLowerCase();
  const caseSorter = breakdownCaseSorter(options.sort);
  const result = projects
    .map((item) => {
      const projectMatches = normalizedQuery
        ? [item.project.name, item.project.projectId, item.project.platform]
            .join(' ')
            .toLocaleLowerCase()
            .includes(normalizedQuery)
        : false;
      const cases = item.cases
        .filter((caseItem) => matchesBreakdownStatus(caseItem, options.status))
        .filter(
          (caseItem) =>
            !normalizedQuery ||
            projectMatches ||
            Boolean(getCaseSearchMatch(caseItem, normalizedQuery)),
        )
        .sort(caseSorter);
      const projectStatus = projectDisplayStatusForSort(item);
      const projectMatchesStatus =
        options.status === 'all' ||
        (options.status === 'attention'
          ? projectStatus !== 'passed'
          : projectStatus === options.status);
      return {
        item,
        cases,
        projectMatches,
        projectMatchesStatus,
      };
    })
    .filter(({ item, cases, projectMatches, projectMatchesStatus }) => {
      if (cases.length) return true;
      return (
        item.cases.length === 0 &&
        projectMatchesStatus &&
        (!normalizedQuery || projectMatches)
      );
    })
    .map(({ item, cases }) => ({ item, cases }));

  return result.sort((a, b) => {
    if (options.sort === 'name') {
      return a.item.project.name.localeCompare(b.item.project.name);
    }
    if (options.sort === 'duration') {
      return (b.item.durationMs ?? 0) - (a.item.durationMs ?? 0);
    }
    if (options.sort === 'issues') {
      return (
        projectIssueCount(b.item) - projectIssueCount(a.item) ||
        a.item.project.name.localeCompare(b.item.project.name)
      );
    }
    return (
      statusSortWeight[projectDisplayStatusForSort(a.item)] -
        statusSortWeight[projectDisplayStatusForSort(b.item)] ||
      projectIssueCount(b.item) - projectIssueCount(a.item) ||
      (b.item.durationMs ?? 0) - (a.item.durationMs ?? 0)
    );
  });
};

const projectDisplayStatusForSort = (
  item: RunnerProjectView,
): RunnerCaseStatus => {
  if (item.project.status === 'failed' || item.failedCount > 0) return 'failed';
  if (item.retryPassedCount > 0) return 'retry-passed';
  if (!item.cases.length || item.notRunCount > 0) return 'not-run';
  return 'passed';
};

const projectExecutionBounds = (
  project: TestRunReportProject,
): { start?: number; end?: number } => {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const document of project.documents) {
    const documentStart = timestamp(document.startedAt);
    const documentEnd = timestamp(document.endedAt);
    if (documentStart !== undefined) starts.push(documentStart);
    if (documentEnd !== undefined) ends.push(documentEnd);
    for (const testCase of document.cases) {
      for (const attempt of testCase.attempts) {
        const attemptStart = timestamp(attempt.startedAt);
        const attemptEnd = timestamp(attempt.endedAt);
        if (attemptStart !== undefined) starts.push(attemptStart);
        if (attemptEnd !== undefined) ends.push(attemptEnd);
      }
    }
  }
  return {
    start: starts.length ? Math.min(...starts) : undefined,
    end: ends.length ? Math.max(...ends) : undefined,
  };
};

export const buildRunnerTimeline = (
  dump: TestRunReportDump,
): RunnerTimelineLane[] => {
  const runStart = timestamp(dump.startedAt) ?? 0;
  const runEnd = timestamp(dump.endedAt) ?? runStart + dump.durationMs;
  const runDuration = Math.max(1, runEnd - runStart, dump.durationMs);
  const makeSegment = (
    projectId: string,
    label: string,
    kind: RunnerTimelineSegment['kind'],
    start: number,
    end: number,
  ): RunnerTimelineSegment | undefined => {
    if (end <= start) return undefined;
    return {
      key: `${projectId}:${kind}`,
      label,
      kind,
      durationMs: end - start,
      offsetPercent: Math.max(
        0,
        Math.min(100, ((start - runStart) / runDuration) * 100),
      ),
      widthPercent: Math.max(
        0.8,
        Math.min(100, ((end - start) / runDuration) * 100),
      ),
    };
  };

  const projectLanes = dump.projects.map((project) => {
    const bounds = projectExecutionBounds(project);
    const lifecycleStart =
      timestamp(project.lifecycle?.startedAt) ?? bounds.start ?? runStart;
    const lifecycleEnd =
      timestamp(project.lifecycle?.endedAt) ?? bounds.end ?? lifecycleStart;
    const executionStart = bounds.start;
    const executionEnd = bounds.end;
    const segments: RunnerTimelineSegment[] = [];
    if (executionStart === undefined || executionEnd === undefined) {
      const setup = makeSegment(
        project.projectId,
        'Setup / install',
        'setup',
        lifecycleStart,
        lifecycleEnd,
      );
      if (setup) segments.push(setup);
    } else {
      const setup = makeSegment(
        project.projectId,
        'Setup / install',
        'setup',
        lifecycleStart,
        executionStart,
      );
      const test = makeSegment(
        project.projectId,
        'Test cases',
        'test',
        executionStart,
        executionEnd,
      );
      const teardown = makeSegment(
        project.projectId,
        'Teardown',
        'teardown',
        executionEnd,
        lifecycleEnd,
      );
      if (setup) segments.push(setup);
      if (test) segments.push(test);
      if (teardown) segments.push(teardown);
    }
    return {
      projectId: project.projectId,
      projectName: project.name,
      status: project.status,
      segments,
    };
  });

  const projectStarts = dump.projects
    .map((project) => {
      const bounds = projectExecutionBounds(project);
      return timestamp(project.lifecycle?.startedAt) ?? bounds.start;
    })
    .filter((value): value is number => value !== undefined);
  const projectEnds = dump.projects
    .map((project) => {
      const bounds = projectExecutionBounds(project);
      return timestamp(project.lifecycle?.endedAt) ?? bounds.end;
    })
    .filter((value): value is number => value !== undefined);
  const runnerSegments: RunnerTimelineSegment[] = [];
  if (projectStarts.length && projectEnds.length) {
    const projectsStart = Math.min(...projectStarts);
    const projectsEnd = Math.max(...projectEnds);
    const preflight = makeSegment(
      'runner',
      'Preflight',
      'setup',
      runStart,
      projectsStart,
    );
    const execution = makeSegment(
      'runner',
      'Projects running',
      'test',
      projectsStart,
      projectsEnd,
    );
    const finalize = makeSegment(
      'runner',
      'Finalize results',
      'teardown',
      projectsEnd,
      runEnd,
    );
    if (preflight) runnerSegments.push(preflight);
    if (execution) runnerSegments.push(execution);
    if (finalize) runnerSegments.push(finalize);
  } else {
    const runner = makeSegment(
      'runner',
      'Runner lifecycle',
      'test',
      runStart,
      runEnd,
    );
    if (runner) runnerSegments.push(runner);
  }

  return [
    {
      projectId: 'runner',
      projectName: 'Runner lifecycle',
      status: dump.status,
      segments: runnerSegments,
    },
    ...projectLanes,
  ];
};

const asScreenshot = (value: unknown): ScreenshotLike | undefined => {
  if (!value || typeof value !== 'object' || !('base64' in value)) {
    return undefined;
  }
  return value as ScreenshotLike;
};

export const buildRunnerVisualIndex = (
  reports: readonly PlaywrightTasks[],
): RunnerVisualIndex => ({
  framesByDetail: new Map(),
  reportsById: new Map(
    reports.flatMap((report) =>
      report.reportId ? [[report.reportId, report] as const] : [],
    ),
  ),
  loadedReportIds: new Set(),
});

const loadReportVisuals = (
  index: RunnerVisualIndex,
  reportId: string,
): void => {
  if (index.loadedReportIds.has(reportId)) return;
  index.loadedReportIds.add(reportId);
  const report = index.reportsById.get(reportId);
  if (!report) return;

  const reportDump = report.get();
  for (const execution of reportDump.executions) {
    if (!execution.id) continue;
    const frames: RunnerVisualFrame[] = [];
    const usedKeys = new Set<string>();
    const addFrame = (
      value: unknown,
      label: string,
      fallbackCapturedAt: number | undefined,
      position: string,
    ) => {
      const screenshot = asScreenshot(value);
      if (!screenshot) return;
      const capturedAt = screenshot.capturedAt ?? fallbackCapturedAt;
      const screenshotId = screenshot.sourceRef?.id;
      const key = screenshotId
        ? `${reportId}:${screenshotId}`
        : `${reportId}:${execution.id}:${position}`;
      if (usedKeys.has(key)) return;
      usedKeys.add(key);
      frames.push({
        key,
        reportId,
        executionId: execution.id!,
        label,
        ...(capturedAt === undefined ? {} : { capturedAt }),
        screenshot,
      });
      if (capturedAt !== undefined) {
        index.firstCapturedAt =
          index.firstCapturedAt === undefined
            ? capturedAt
            : Math.min(index.firstCapturedAt, capturedAt);
        index.lastCapturedAt =
          index.lastCapturedAt === undefined
            ? capturedAt
            : Math.max(index.lastCapturedAt, capturedAt);
      }
    };

    for (const [taskIndex, task] of execution.tasks.entries()) {
      const label = task.subType ? `${task.type} · ${task.subType}` : task.type;
      addFrame(
        task.uiContext?.screenshot,
        label,
        task.timing?.start,
        `task-${taskIndex}-context`,
      );
      for (const [recorderIndex, recorder] of (task.recorder ?? []).entries()) {
        addFrame(
          recorder.screenshot,
          recorder.description || label,
          recorder.ts,
          `task-${taskIndex}-recorder-${recorderIndex}`,
        );
      }
    }
    index.framesByDetail.set(detailKey(reportId, execution.id), frames);
  }
};

const evenlySample = <T>(items: readonly T[], limit: number): T[] => {
  if (items.length <= limit) return [...items];
  if (limit <= 1) return [items.at(-1)!];
  const indices = new Set<number>();
  for (let index = 0; index < limit; index += 1) {
    indices.add(Math.round((index * (items.length - 1)) / (limit - 1)));
  }
  return [...indices].map((index) => items[index]);
};

export const getVisualFrames = (
  details: readonly TestRunReportAgentDetail[] | undefined,
  index: RunnerVisualIndex,
  limit = 4,
): RunnerVisualFrame[] => {
  if (!details?.length) return [];
  for (const reportId of new Set(details.map((detail) => detail.reportId))) {
    loadReportVisuals(index, reportId);
  }
  const frames = details.flatMap(
    (detail) =>
      index.framesByDetail.get(
        detailKey(detail.reportId, detail.executionId),
      ) ?? [],
  );
  return evenlySample(frames, limit);
};

export const getAttemptVisualFrames = (
  attempt: TestRunReportAttempt | undefined,
  index: RunnerVisualIndex,
  limit = 6,
): RunnerVisualFrame[] => {
  if (!attempt) return [];
  return getVisualFrames(
    flattenAttemptSteps(attempt).flatMap((step) => step.agentDetails ?? []),
    index,
    limit,
  );
};

export const getAllAttemptVisualFrames = (
  attempt: TestRunReportAttempt | undefined,
  index: RunnerVisualIndex,
): RunnerVisualFrame[] =>
  getAttemptVisualFrames(attempt, index, Number.POSITIVE_INFINITY);

export const getStepForVisualFrame = (
  steps: readonly TestRunReportStep[],
  frame: RunnerVisualFrame,
): TestRunReportStep | undefined =>
  steps.find((step) =>
    step.agentDetails?.some(
      (detail) =>
        detail.reportId === frame.reportId &&
        detail.executionId === frame.executionId,
    ),
  );

export const getDefaultVisualFrameForStep = (
  step: TestRunReportStep,
  frames: readonly RunnerVisualFrame[],
): RunnerVisualFrame | undefined =>
  frames.find((frame) =>
    step.agentDetails?.some(
      (detail) =>
        detail.reportId === frame.reportId &&
        detail.executionId === frame.executionId,
    ),
  );

export const positionAttemptVisualFrames = (
  attempt: TestRunReportAttempt,
  frames: readonly RunnerVisualFrame[],
): RunnerPositionedVisualFrame[] => {
  const steps = flattenAttemptSteps(attempt);
  const attemptStartedAt = timestamp(attempt.startedAt);
  const attemptEndedAt = timestamp(attempt.endedAt);
  const measuredDurationMs =
    attemptStartedAt !== undefined && attemptEndedAt !== undefined
      ? Math.max(0, attemptEndedAt - attemptStartedAt)
      : 0;
  const capturedTimes = frames.flatMap((frame) =>
    frame.capturedAt === undefined ? [] : [frame.capturedAt],
  );
  const firstCapturedAt = capturedTimes.length
    ? Math.min(...capturedTimes)
    : undefined;
  const lastCapturedAt = capturedTimes.length
    ? Math.max(...capturedTimes)
    : undefined;
  const capturedSpanMs =
    firstCapturedAt !== undefined && lastCapturedAt !== undefined
      ? Math.max(0, lastCapturedAt - firstCapturedAt)
      : 0;
  const timelineDurationMs = Math.max(
    1,
    attempt.durationMs,
    measuredDurationMs,
    capturedSpanMs,
  );
  const usesAttemptClock =
    attemptStartedAt !== undefined &&
    firstCapturedAt !== undefined &&
    firstCapturedAt >= attemptStartedAt - 1_000 &&
    firstCapturedAt <= attemptStartedAt + timelineDurationMs + 1_000;

  return frames
    .map((frame, sourceIndex) => {
      let offsetMs: number;
      if (frame.capturedAt !== undefined && usesAttemptClock) {
        offsetMs = frame.capturedAt - attemptStartedAt!;
      } else if (
        frame.capturedAt !== undefined &&
        firstCapturedAt !== undefined
      ) {
        offsetMs = frame.capturedAt - firstCapturedAt;
      } else if (frames.length > 1) {
        offsetMs = (timelineDurationMs * sourceIndex) / (frames.length - 1);
      } else {
        offsetMs = 0;
      }
      const clampedOffsetMs = Math.max(
        0,
        Math.min(timelineDurationMs, offsetMs),
      );
      return {
        frame,
        offsetMs: clampedOffsetMs,
        offsetPercent: (clampedOffsetMs / timelineDurationMs) * 100,
        stepId: getStepForVisualFrame(steps, frame)?.id,
        sourceIndex,
      };
    })
    .sort(
      (left, right) =>
        left.offsetMs - right.offsetMs || left.sourceIndex - right.sourceIndex,
    )
    .map(
      ({ sourceIndex: _sourceIndex, ...positionedFrame }) => positionedFrame,
    );
};

export const getAttemptVisualStory = (
  attempt: TestRunReportAttempt | undefined,
  index: RunnerVisualIndex,
  limit = 5,
): RunnerVisualStoryItem[] => {
  if (!attempt) return [];
  const primarySteps = attempt.steps.length
    ? attempt.steps
    : flattenAttemptSteps(attempt);
  return evenlySample(primarySteps, limit).map((step) => ({
    key: step.id,
    step,
    label: getStepDisplayName(step),
    frame: getVisualFrames(step.agentDetails, index, 1).at(-1),
  }));
};

export const statusSortWeight: Record<RunnerCaseStatus, number> = {
  failed: 0,
  'retry-passed': 1,
  'not-run': 2,
  passed: 3,
};
