import {
  type RunnerRoute,
  runnerRouteFromHash,
  runnerStepIdFromHash,
} from '../../utils/test-run-report';
import {
  type RunnerCaseView,
  type RunnerProjectView,
  type RunnerStepSelector,
  type RunnerStepTarget,
  getRunnerCaseStepTargets,
  isRunnerStepSelector,
  resolveRunnerStepSelector,
} from './model';

type RunnerPage = RunnerRoute['page'];

export interface RunnerNavigationState {
  page: RunnerPage;
  selectedCaseKey?: string;
  deepLinkedStepId?: string;
  unmatchedStepSelector?: RunnerStepSelector;
}

export const isSingleCaseReport = (
  projects: readonly RunnerProjectView[],
): boolean =>
  projects.length === 1 &&
  projects[0].project.documents.reduce(
    (count, document) => count + document.cases.length,
    0,
  ) === 1;

const resolveRunnerStepTarget = (
  stepReference: string | undefined,
  targets: readonly RunnerStepTarget[],
): RunnerStepTarget | undefined => {
  if (!stepReference) return undefined;
  return isRunnerStepSelector(stepReference)
    ? resolveRunnerStepSelector(targets, stepReference)
    : targets.find((target) => target.step.id === stepReference);
};

export const resolveRunnerNavigation = (
  hash: string,
  cases: readonly RunnerCaseView[],
  projects: readonly RunnerProjectView[],
  stepIndex: readonly RunnerStepTarget[],
): RunnerNavigationState => {
  const route = runnerRouteFromHash(hash);
  const stepReference = runnerStepIdFromHash(hash);
  const stepSelector = isRunnerStepSelector(stepReference)
    ? stepReference
    : undefined;
  const selectedRouteCase =
    route.page === 'case'
      ? cases.find(
          (item) =>
            item.key === route.caseKey &&
            item.project.projectId === route.projectId,
        )
      : undefined;
  const targetPool = selectedRouteCase
    ? getRunnerCaseStepTargets(selectedRouteCase)
    : stepIndex;
  const stepTarget = resolveRunnerStepTarget(stepReference, targetPool);
  const unmatchedStepSelector =
    stepSelector && !stepTarget ? stepSelector : undefined;

  if (selectedRouteCase) {
    return {
      page: 'case',
      selectedCaseKey: selectedRouteCase.key,
      deepLinkedStepId: stepTarget?.step.id,
      ...(unmatchedStepSelector ? { unmatchedStepSelector } : {}),
    };
  }

  if (isSingleCaseReport(projects) && cases.length === 1) {
    const [onlyCase] = cases;
    return {
      page: 'case',
      selectedCaseKey: onlyCase.key,
      deepLinkedStepId: stepTarget?.step.id,
      ...(unmatchedStepSelector ? { unmatchedStepSelector } : {}),
    };
  }

  const hasExplicitPage = new URLSearchParams(
    hash.startsWith('#') ? hash.slice(1) : '',
  ).has('runner-page');
  if (!hasExplicitPage && stepTarget) {
    return {
      page: 'case',
      selectedCaseKey: stepTarget.item.key,
      deepLinkedStepId: stepTarget.step.id,
    };
  }

  return {
    page: 'overview',
    ...(unmatchedStepSelector ? { unmatchedStepSelector } : {}),
  };
};
