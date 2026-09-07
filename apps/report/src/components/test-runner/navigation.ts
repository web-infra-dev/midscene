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
type RunnerCaseParent = 'overview' | 'project';

export interface RunnerNavigationState {
  page: RunnerPage;
  selectedProjectId?: string;
  selectedCaseKey?: string;
  caseParent: RunnerCaseParent;
  deepLinkedStepId?: string;
}

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

export const resolveRunnerNavigation = (
  hash: string,
  cases: readonly RunnerCaseView[],
  projects: readonly RunnerProjectView[],
): RunnerNavigationState => {
  const route = runnerRouteFromHash(hash);
  const stepId = runnerStepIdFromHash(hash);

  if (isSingleCaseReport(projects) && cases.length === 1) {
    const [onlyCase] = cases;
    return {
      page: 'case',
      selectedProjectId: onlyCase.project.projectId,
      selectedCaseKey: onlyCase.key,
      caseParent: 'overview',
      deepLinkedStepId: caseContainsStep(onlyCase, stepId) ? stepId : undefined,
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
        selectedProjectId: selectedCase.project.projectId,
        selectedCaseKey: selectedCase.key,
        caseParent: route.parent,
        deepLinkedStepId: caseContainsStep(selectedCase, stepId)
          ? stepId
          : undefined,
      };
    }
  }

  if (route.page === 'project') {
    const selectedProject = projects.find(
      (item) => item.project.projectId === route.projectId,
    );
    if (selectedProject) {
      return {
        page: 'project',
        selectedProjectId: selectedProject.project.projectId,
        caseParent: 'project',
      };
    }
  }

  const hasExplicitPage = new URLSearchParams(
    hash.startsWith('#') ? hash.slice(1) : '',
  ).has('runner-page');
  if (!hasExplicitPage && stepId) {
    const linkedCase = cases.find((item) => caseContainsStep(item, stepId));
    if (linkedCase) {
      return {
        page: 'case',
        selectedProjectId: linkedCase.project.projectId,
        selectedCaseKey: linkedCase.key,
        caseParent: 'overview',
        deepLinkedStepId: stepId,
      };
    }
  }

  return { page: 'overview', caseParent: 'overview' };
};
