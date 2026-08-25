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
