import type {
  StepExecutionInfo,
  StepRunResult,
  WorkflowDocumentRunResult,
} from '@midscene/core/internal/test-runner';
import type {
  CollectedCase,
  WorkflowDocumentSource,
} from '@midscene/core/internal/test-runner';
import type { LoadedExecutionProject, TestFileSelection } from './test-project';
import type {
  TestExecutionProjectRunResult,
  TestProjectCaseRunResult,
  TestProjectCollectionError,
} from './types';

export interface ProjectResultInput {
  readonly project: LoadedExecutionProject;
  readonly platform?: string;
  readonly fileSelection: TestFileSelection;
  readonly sources: readonly WorkflowDocumentSource[];
  readonly collectionErrors: readonly TestProjectCollectionError[];
  readonly selectedCaseCount: number;
  readonly filteredCaseCount: number;
}

export const asNotRun = (
  documentId: string,
  collectedCase: CollectedCase,
  projectName: string,
  reason: NonNullable<TestProjectCaseRunResult['notRunReason']>,
): TestProjectCaseRunResult => ({
  documentId,
  caseId: collectedCase.caseId,
  projectName,
  name: collectedCase.definition.name,
  sourcePath: collectedCase.sourcePath,
  caseIndex: collectedCase.caseIndex,
  status: 'not-run',
  notRunReason: reason,
});

export const formatStep = (info: StepExecutionInfo): string => {
  const position = info.scope === 'case' ? info.case : info.document;
  const phase = position.phase === 'steps' ? 'step' : position.phase;
  return `${phase} ${position.stepIndex + 1}/${info.stepCount}: ${info.node}`;
};

export const formatStepResult = (
  info: StepExecutionInfo,
  result: StepRunResult,
  indent = '',
): string => {
  const symbol = result.status === 'success' ? '✓' : '✗';
  const error = result.error ? ` — ${result.error.message}` : '';
  const continuation = result.continuedAfterError ? '; continuing' : '';
  return `${indent}${symbol} ${formatStep(info)} (${result.durationMs} ms)${error}${continuation}`;
};

export const latestById = <T>(
  items: readonly T[],
  id: (item: T) => string,
): T[] => [...new Map(items.map((item) => [id(item), item])).values()];

export const buildProjectResult = (
  prepared: ProjectResultInput,
  cases: readonly TestProjectCaseRunResult[],
  documents: readonly WorkflowDocumentRunResult[],
  lifecycle?: TestExecutionProjectRunResult['lifecycle'],
): TestExecutionProjectRunResult => {
  const { project } = prepared;
  const projectFailed =
    prepared.collectionErrors.length > 0 ||
    latestById(cases, (item) => item.caseId).some(
      (item) =>
        item.status !== 'success' ||
        item.execution?.lifecycle?.status === 'failed',
    ) ||
    latestById(documents, (item) => item.documentId).some(
      (item) => item.status === 'failed',
    ) ||
    lifecycle?.status === 'failed';
  return {
    projectId: project.projectId,
    name: project.name,
    ...(prepared.platform ? { platform: prepared.platform } : {}),
    status: projectFailed ? 'failed' : 'success',
    retry: project.retry,
    fileSelection: prepared.fileSelection,
    tagSelection: project.tags,
    sourceCount: prepared.sources.length,
    selectedCaseCount: prepared.selectedCaseCount,
    filteredCaseCount: prepared.filteredCaseCount,
    ...(lifecycle ? { lifecycle } : {}),
    cases,
    documents,
    collectionErrors: prepared.collectionErrors,
  };
};
