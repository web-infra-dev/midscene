import { orderBy } from 'es-toolkit';
import type { UIData } from '../core/reporter';

export type TestcaseView = UIData['testcases'][number];
export type EvaluationResult = NonNullable<UIData['results']>[number];
export type ModelSummary = NonNullable<UIData['summaries']>['models'][number];

export const emptyFilters = {
  search: '',
  platform: '',
  category: '',
  dataset: '',
  outcome: '',
};
export type Filters = typeof emptyFilters;

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

export function testcasePath(name?: string, model?: string, search = '') {
  const params = new URLSearchParams(search);
  params.delete('search');
  if (model) params.set('model', model);
  const query = params.toString();
  return `/testcases${name ? `/${encodeURIComponent(name)}` : ''}${query ? `?${query}` : ''}`;
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

export const resultStatusLabels = {
  missing: 'No result',
  error: 'Error',
  passed: 'Passed',
  failed: 'Failed',
};

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
  const value = (model: ModelSummary) =>
    key === 'model' || key === 'score' ? model[key] : model[key].average;
  return orderBy(
    models,
    [(model) => value(model) === null, value, 'model'],
    ['asc', direction === 'ascending' ? 'asc' : 'desc', 'asc'],
  );
}
