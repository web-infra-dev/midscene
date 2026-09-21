import type { TestRunReportAttempt, TestRunReportStep } from '@midscene/core';
import { type RunnerCaseView, flattenAttemptSteps } from './model';

export interface RunnerStepGroup {
  label: string;
  steps: TestRunReportStep[];
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
  return [
    { label: 'Document setup', steps: document.beforeAll },
    { label: 'Before each', steps: attempt?.beforeEach ?? [] },
    { label: 'Case steps', steps: attempt?.steps ?? [] },
    { label: 'After each', steps: attempt?.afterEach ?? [] },
    { label: 'Document teardown', steps: document.afterAll },
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
    attemptSteps.find((step) => step.status === 'failed') ??
    documentSteps.find((step) => step.status === 'failed') ??
    attempt?.steps.find((step) => step.agentDetails?.length) ??
    attempt?.steps[0] ??
    attemptSteps[0] ??
    document.beforeAll[0] ??
    document.afterAll[0]
  );
};
