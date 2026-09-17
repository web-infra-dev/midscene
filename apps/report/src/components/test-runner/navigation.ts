import {
  type RunnerRoute,
  runnerRouteFromHash,
  runnerStepIdFromHash,
} from '../../utils/test-run-report';
import {
  type RunnerCaseView,
  type RunnerProjectView,
  flattenAttemptSteps,
} from './model';

type RunnerPage = RunnerRoute['page'];

export interface RunnerNavigationState {
  page: RunnerPage;
  selectedCaseKey?: string;
  deepLinkedStepId?: string;
}

type RunnerStepSelector = 'first' | 'last' | 'first-error' | 'last-error';

interface RunnerStepTarget {
  item: RunnerCaseView;
  stepId: string;
  failed: boolean;
}

const runnerStepSelectors = new Set<RunnerStepSelector>([
  'first',
  'last',
  'first-error',
  'last-error',
]);

const isRunnerStepSelector = (
  value: string | undefined,
): value is RunnerStepSelector =>
  Boolean(value && runnerStepSelectors.has(value as RunnerStepSelector));

export const isSingleCaseReport = (
  projects: readonly RunnerProjectView[],
): boolean =>
  projects.length === 1 &&
  projects[0].project.documents.reduce(
    (count, document) => count + document.cases.length,
    0,
  ) === 1;

const caseContainsStep = (
  item: RunnerCaseView,
  stepId: string | undefined,
): boolean =>
  Boolean(
    stepId &&
      (item.document.beforeAll.some((step) => step.id === stepId) ||
        item.document.afterAll.some((step) => step.id === stepId) ||
        item.testCase.attempts.some((attempt) =>
          flattenAttemptSteps(attempt).some((step) => step.id === stepId),
        )),
  );

const getRunnerStepTargets = (
  cases: readonly RunnerCaseView[],
): RunnerStepTarget[] => {
  const result: RunnerStepTarget[] = [];
  const casesByDocument = new Map<
    RunnerCaseView['document'],
    RunnerCaseView[]
  >();
  for (const item of cases) {
    const documentCases = casesByDocument.get(item.document) ?? [];
    documentCases.push(item);
    casesByDocument.set(item.document, documentCases);
  }

  for (const documentCases of casesByDocument.values()) {
    const firstCase = documentCases[0];
    const lastCase = documentCases.at(-1);
    if (!firstCase || !lastCase) continue;
    result.push(
      ...firstCase.document.beforeAll.map((step) => ({
        item: firstCase,
        stepId: step.id,
        failed: step.status === 'failed',
      })),
    );
    for (const item of documentCases) {
      for (const attempt of item.testCase.attempts) {
        result.push(
          ...flattenAttemptSteps(attempt).map((step) => ({
            item,
            stepId: step.id,
            failed: step.status === 'failed',
          })),
        );
      }
    }
    result.push(
      ...lastCase.document.afterAll.map((step) => ({
        item: lastCase,
        stepId: step.id,
        failed: step.status === 'failed',
      })),
    );
  }

  return result;
};

const resolveRunnerStepTarget = (
  stepReference: string | undefined,
  cases: readonly RunnerCaseView[],
): RunnerStepTarget | undefined => {
  if (!stepReference) return undefined;
  if (!isRunnerStepSelector(stepReference)) {
    const item = cases.find((candidate) =>
      caseContainsStep(candidate, stepReference),
    );
    return item ? { item, stepId: stepReference, failed: false } : undefined;
  }

  const wantsError = stepReference.endsWith('-error');
  const candidates = getRunnerStepTargets(cases).filter(
    (target) => !wantsError || target.failed,
  );
  return stepReference.startsWith('last') ? candidates.at(-1) : candidates[0];
};

export const resolveRunnerNavigation = (
  hash: string,
  cases: readonly RunnerCaseView[],
  projects: readonly RunnerProjectView[],
): RunnerNavigationState => {
  const route = runnerRouteFromHash(hash);
  const stepReference = runnerStepIdFromHash(hash);
  const stepTarget = resolveRunnerStepTarget(stepReference, cases);
  const stepId = stepTarget?.stepId;

  if (isSingleCaseReport(projects) && cases.length === 1) {
    const [onlyCase] = cases;
    return {
      page: 'case',
      selectedCaseKey: onlyCase.key,
      deepLinkedStepId: caseContainsStep(onlyCase, stepId) ? stepId : undefined,
    };
  }

  if (stepTarget && isRunnerStepSelector(stepReference)) {
    return {
      page: 'case',
      selectedCaseKey: stepTarget.item.key,
      deepLinkedStepId: stepTarget.stepId,
    };
  }

  if (route.page === 'case') {
    const selectedCase = cases.find(
      (item) =>
        item.key === route.caseKey &&
        item.project.projectId === route.projectId,
    );
    if (selectedCase) {
      return {
        page: 'case',
        selectedCaseKey: selectedCase.key,
        deepLinkedStepId: caseContainsStep(selectedCase, stepId)
          ? stepId
          : undefined,
      };
    }
  }

  const hasExplicitPage = new URLSearchParams(
    hash.startsWith('#') ? hash.slice(1) : '',
  ).has('runner-page');
  if (!hasExplicitPage && stepTarget) {
    return {
      page: 'case',
      selectedCaseKey: stepTarget.item.key,
      deepLinkedStepId: stepTarget.stepId,
    };
  }

  return { page: 'overview' };
};
