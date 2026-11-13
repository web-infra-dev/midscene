import type { UIData } from '../reporter';

export type TestcaseView = UIData['testcases'][number];
export type EvaluationResult = NonNullable<UIData['results']>[number];
export type ModelSummary = NonNullable<UIData['summaries']>['models'][number];

export interface Filters {
  search: string;
  platform: string;
  category: string;
  dataset: string;
  outcome: string;
}

export const emptyFilters: Filters = {
  search: '',
  platform: '',
  category: '',
  dataset: '',
  outcome: '',
};

export function compareNames(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function filterTestcases(testcases: TestcaseView[], filters: Filters) {
  const terms = filters.search
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return testcases.filter((testcase) => {
    const searchable =
      `${testcase.name}\n${testcase.instruction.en}\n${testcase.instruction.zh}`.toLowerCase();
    return (
      terms.every((term) => searchable.includes(term)) &&
      (!filters.platform || testcase.platform === filters.platform) &&
      (!filters.category || testcase.category.item === filters.category) &&
      (!filters.dataset || testcase.reference.dataset === filters.dataset) &&
      (!filters.outcome ||
        (testcase.groundTruth === 'REFUSAL' ? 'refusal' : 'point') ===
          filters.outcome)
    );
  });
}

export function testcasePath(name?: string, model?: string) {
  return `/testcases${name ? `/${encodeURIComponent(name)}` : ''}${model ? `?model=${encodeURIComponent(model)}` : ''}`;
}

export function resultKey(testcase: string, model: string) {
  return JSON.stringify([testcase, model]);
}

export function resultStatus(result?: EvaluationResult) {
  return !result
    ? 'missing'
    : result.output.type === 'ERROR'
      ? 'error'
      : result.output.correct
        ? 'passed'
        : 'failed';
}

export function resultStatusLabel(result?: EvaluationResult) {
  return {
    missing: 'No result',
    error: 'Error',
    passed: 'Passed',
    failed: 'Failed',
  }[resultStatus(result)];
}

export function selectModel(models: string[], requested: string | null) {
  return requested && models.includes(requested) ? requested : models[0];
}

export type ModelSortKey =
  | 'model'
  | 'score'
  | 'totalTokens'
  | 'inputTokens'
  | 'outputTokens'
  | 'estimatedCost'
  | 'estimatedElapsedTime'
  | 'duration';

export function sortModels(
  models: ModelSummary[],
  key: ModelSortKey,
  direction: 'ascending' | 'descending',
) {
  return [...models].sort((left, right) => {
    const a =
      key === 'model' || key === 'score' ? left[key] : left[key].average;
    const b =
      key === 'model' || key === 'score' ? right[key] : right[key].average;
    if (a === null)
      return b === null ? compareNames(left.model, right.model) : 1;
    if (b === null) return -1;
    const value =
      typeof a === 'number' && typeof b === 'number'
        ? a - b
        : compareNames(String(a), String(b));
    return (
      (direction === 'ascending' ? value : -value) ||
      compareNames(left.model, right.model)
    );
  });
}

export function matrixRowStatus(cells: (EvaluationResult | undefined)[]) {
  if (!cells.length || cells.some((result) => !result)) return 'incomplete';
  const passed = cells.filter((result) => result?.output.correct).length;
  return passed === cells.length
    ? 'all-passed'
    : passed === 0
      ? 'all-failed'
      : 'mixed';
}
