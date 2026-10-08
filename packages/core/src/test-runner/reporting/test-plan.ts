import type {
  TestRunReportCasePlan,
  TestRunReportDocumentPlan,
  TestRunReportPlannedStep,
  TestRunReportStepPhase,
} from '../../test-run-report';
import type {
  CollectedWorkflowDocument,
  NormalizedStep,
} from '../parser/types';
import { sanitizeReportText, sanitizeReportValue } from './sanitize';

export function buildTestRunReportPlan(
  document: CollectedWorkflowDocument,
  options: {
    selectedCaseIds?: readonly string[];
    defaultTimeoutMs?: number;
    retry?: TestRunReportDocumentPlan['retry'];
  } = {},
): TestRunReportDocumentPlan {
  const selected = new Set(
    options.selectedCaseIds ?? document.cases.map((c) => c.caseId),
  );
  const steps = (
    items: readonly NormalizedStep[],
    phase: TestRunReportStepPhase,
    owner: string,
  ): TestRunReportPlannedStep[] =>
    items.map((step, stepIndex) => {
      const input = step.templateInput ?? step.input;
      const candidate =
        input.prompt ?? input.script ?? input.scenario ?? input.title;
      const title =
        typeof candidate === 'string'
          ? candidate
          : candidate &&
              typeof candidate === 'object' &&
              'prompt' in candidate &&
              typeof candidate.prompt === 'string'
            ? candidate.prompt
            : undefined;
      return {
        id: `${document.documentId}:${owner}:${phase}:${stepIndex}`,
        phase,
        stepIndex,
        node: step.node,
        ...(title ? { title: sanitizeReportText(title, 240) } : {}),
        input: sanitizeReportValue(input),
        inputMode: step.templateInput ? 'template' : 'resolved',
        ...((step.meta.timeoutMs ?? options.defaultTimeoutMs) === undefined
          ? {}
          : { timeoutMs: step.meta.timeoutMs ?? options.defaultTimeoutMs }),
        continueOnError: step.meta.continueOnError,
      };
    });
  const cases: TestRunReportCasePlan[] = document.cases.map((item) => ({
    caseId: item.caseId,
    name: item.definition.name,
    caseIndex: item.caseIndex,
    selected: selected.has(item.caseId),
    tags: [...(item.definition.tags ?? [])],
    ...(item.definition.onFailure
      ? { onFailure: item.definition.onFailure }
      : {}),
    beforeEach: steps(document.lifecycle.beforeEach, 'beforeEach', item.caseId),
    steps: steps(item.definition.steps, 'steps', item.caseId),
    afterEach: steps(document.lifecycle.afterEach, 'afterEach', item.caseId),
  }));
  return {
    documentId: document.documentId,
    sourcePath: document.sourcePath,
    retry: options.retry ?? { scope: 'case', count: 0 },
    beforeAll: steps(document.lifecycle.beforeAll, 'beforeAll', 'document'),
    cases,
    afterAll: steps(document.lifecycle.afterAll, 'afterAll', 'document'),
  };
}
