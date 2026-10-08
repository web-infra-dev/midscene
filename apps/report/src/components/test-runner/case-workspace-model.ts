import type {
  TestRunReportAttempt,
  TestRunReportPlannedStep,
  TestRunReportStep,
} from '@midscene/core';
import type { LifecycleIssue } from './lifecycle-errors';
import { type RunnerCaseView, flattenAttemptSteps } from './model';

export interface RunnerStepGroup {
  label: string;
  steps: TestRunReportStep[];
}

const phaseLabels = {
  beforeAll: 'Document setup',
  beforeEach: 'Before each',
  steps: 'Case',
  afterEach: 'After each',
  afterAll: 'Document teardown',
};
const describeStepFailure = (step: TestRunReportStep): string =>
  step.status === 'not-run'
    ? `${phaseLabels[step.phase]} step ${step.stepIndex + 1} was not run: ${step.notRunReason}`
    : `${phaseLabels[step.phase]} step ${step.stepIndex + 1} failed: ${step.title ?? step.node}`;
const notRunReasons: Record<string, string> = {
  'document-start-failed':
    'Document setup failed before this case could start.',
  'project-start-failed': 'Project setup failed before this case could start.',
  'project-preflight-failed': 'Project validation failed before execution.',
  'fatal-error': 'Execution stopped after a fatal resource error.',
  interrupted: 'Execution was cancelled before this step could start.',
  bail: 'Execution stopped after an earlier case failed.',
};

export function getCaseNotRunReason(item: RunnerCaseView): string {
  const failure = item.document.beforeAll.find(
    (step) => step.status !== 'success',
  );
  return failure
    ? describeStepFailure(failure)
    : (notRunReasons[item.testCase.notRunReason ?? ''] ??
        item.testCase.notRunReason ??
        'This case was not executed.');
}

export const getCaseWorkspaceDocument = (
  item: RunnerCaseView,
  attempt?: TestRunReportAttempt,
  documentAttemptIndex?: number,
) =>
  item.document.attempts?.find(
    (document) =>
      document.attemptIndex === (documentAttemptIndex ?? attempt?.attemptIndex),
  ) ?? item.document;

export const getCaseWorkspaceDocumentAttemptIndex = (
  item: RunnerCaseView,
  stepId?: string,
): number | undefined => {
  const documents = item.document.attempts;
  if (!documents) return undefined;
  return (
    documents.find(
      (document) =>
        [...document.beforeAll, ...document.afterAll].some(
          (step) => step.id === stepId,
        ) ||
        item.testCase.attempts.some(
          (attempt) =>
            attempt.attemptIndex === document.attemptIndex &&
            flattenAttemptSteps(attempt).some((step) => step.id === stepId),
        ),
    ) ?? documents.at(-1)
  )?.attemptIndex;
};

export const getCaseWorkspaceStepGroups = (
  item: RunnerCaseView,
  attempt?: TestRunReportAttempt,
  documentAttemptIndex?: number,
): RunnerStepGroup[] => {
  const document = getCaseWorkspaceDocument(
    item,
    attempt,
    documentAttemptIndex,
  );
  const join = (
    planned: readonly TestRunReportPlannedStep[] | undefined,
    actual: readonly TestRunReportStep[],
    preceding: readonly TestRunReportStep[],
  ): TestRunReportStep[] => {
    if (!planned) return [...actual];
    const failure =
      preceding.find((step) => step.status !== 'success') ??
      actual.find(
        (step) => step.status !== 'success' && !step.continuedAfterError,
      );
    const reason = failure
      ? describeStepFailure(failure)
      : (notRunReasons[item.testCase.notRunReason ?? ''] ??
        item.testCase.notRunReason ??
        'Execution stopped before this step.');
    const results = new Map(actual.map((step) => [step.stepIndex, step]));
    return planned.map(
      (step) =>
        results.get(step.stepIndex) ?? {
          ...step,
          id: `plan:${step.id}`,
          planStepId: step.id,
          status: 'not-run',
          notRunReason: reason,
          blockedBy: failure?.id,
          continuedAfterError: false,
        },
    );
  };
  const plan = item.testCase.plan;
  return [
    {
      label: 'Document setup',
      steps: join(document.plan?.beforeAll, document.beforeAll, []),
    },
    {
      label: 'Before each',
      steps: join(
        plan?.beforeEach,
        attempt?.beforeEach ?? [],
        document.beforeAll,
      ),
    },
    {
      label: 'Case steps',
      steps: join(plan?.steps, attempt?.steps ?? [], [
        ...document.beforeAll,
        ...(attempt?.beforeEach ?? []),
      ]),
    },
    {
      label: 'After each',
      steps: join(
        plan?.afterEach,
        attempt?.afterEach ?? [],
        attempt ? [] : document.beforeAll,
      ),
    },
    {
      label: 'Document teardown',
      steps: join(document.plan?.afterAll, document.afterAll, []),
    },
  ].filter((group) => group.steps.length);
};

export const getDefaultCaseWorkspaceStep = (
  item: RunnerCaseView,
  attempt?: TestRunReportAttempt,
  documentAttemptIndex?: number,
): TestRunReportStep | undefined => {
  const attemptSteps = attempt ? flattenAttemptSteps(attempt) : [];
  const document = getCaseWorkspaceDocument(
    item,
    attempt,
    documentAttemptIndex,
  );
  const documentSteps = [...document.beforeAll, ...document.afterAll];
  return (
    attemptSteps.find((step) => step.status !== 'success') ??
    documentSteps.find((step) => step.status !== 'success') ??
    attempt?.steps.find((step) => step.agentDetails?.length) ??
    attempt?.steps[0] ??
    attemptSteps[0] ??
    document.beforeAll[0] ??
    document.afterAll[0] ??
    getCaseWorkspaceStepGroups(item, attempt, documentAttemptIndex)[0]?.steps[0]
  );
};

export const getCaseWorkspaceLifecycleIssues = (
  item: RunnerCaseView,
  attempt?: TestRunReportAttempt,
  documentAttemptIndex?: number,
): LifecycleIssue[] => {
  const document = getCaseWorkspaceDocument(
    item,
    attempt,
    documentAttemptIndex,
  );
  const attemptLabel = `Attempt ${(attempt?.attemptIndex ?? 0) + 1}`;

  return [
    ...(attempt?.hostErrors ?? []).map(({ phase, error }) => ({
      label: `${attemptLabel}: ${phase} failed`,
      error,
    })),
    ...(document.hostErrors ?? []).map(({ phase, error }) => ({
      label: `Document ${phase} failed`,
      error,
    })),
    ...(attempt?.teardownErrors ?? []).map((error) => ({
      label: `${attemptLabel}: Case teardown failed`,
      error,
    })),
    ...(document.teardownErrors ?? []).map((error) => ({
      label: 'Document teardown failed',
      error,
    })),
  ];
};

export function getWorkspaceTimelineRange(
  steps: readonly TestRunReportStep[],
  attempt?: TestRunReportAttempt,
) {
  const times = steps
    .filter((step) => step.status !== 'not-run')
    .flatMap((step) => [Date.parse(step.startedAt), Date.parse(step.endedAt)])
    .filter(Number.isFinite);
  if (attempt)
    times.push(
      ...[Date.parse(attempt.startedAt), Date.parse(attempt.endedAt)].filter(
        Number.isFinite,
      ),
    );
  if (!times.length) return undefined;
  const start = Math.min(...times);
  const end = Math.max(...times);
  return {
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
    durationMs: end - start,
  };
}
