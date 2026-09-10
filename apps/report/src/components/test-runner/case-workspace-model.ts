import type { TestRunReportAttempt, TestRunReportStep } from '@midscene/core';
import { type RunnerCaseView, flattenAttemptSteps } from './model';

export interface RunnerStepGroup {
  label: string;
  steps: TestRunReportStep[];
}

export const getCaseWorkspaceStepGroups = (
  item: RunnerCaseView,
  attempt?: TestRunReportAttempt,
): RunnerStepGroup[] =>
  [
    { label: 'Document setup', steps: item.document.beforeAll },
    { label: 'Before each', steps: attempt?.beforeEach ?? [] },
    { label: 'Case steps', steps: attempt?.steps ?? [] },
    { label: 'After each', steps: attempt?.afterEach ?? [] },
    { label: 'Document teardown', steps: item.document.afterAll },
  ].filter((group) => group.steps.length);

export const getDefaultCaseWorkspaceStep = (
  item: RunnerCaseView,
  attempt?: TestRunReportAttempt,
): TestRunReportStep | undefined => {
  const attemptSteps = attempt ? flattenAttemptSteps(attempt) : [];
  const documentSteps = [...item.document.beforeAll, ...item.document.afterAll];
  return (
    attemptSteps.find((step) => step.status === 'failed') ??
    documentSteps.find((step) => step.status === 'failed') ??
    attempt?.steps.find((step) => step.agentDetails?.length) ??
    attempt?.steps[0] ??
    attemptSteps[0] ??
    item.document.beforeAll[0] ??
    item.document.afterAll[0]
  );
};
