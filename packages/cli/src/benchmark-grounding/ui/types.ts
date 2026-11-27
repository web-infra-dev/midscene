import { orderBy } from 'es-toolkit';
import { economyRate } from '../core/overview';
import type { UIData } from '../core/reporter';

export { resultStatus } from '../core/overview';

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

export const resultStatusLabels = {
  missing: 'No result',
  error: 'Execution error',
  passed: 'Passed',
  failed: 'Failed',
};

export type ModelSortKey =
  | 'model'
  | 'accuracy'
  | 'balance'
  | 'totalTokens'
  | 'inputTokens'
  | 'outputTokens'
  | 'economy'
  | 'performance'
  | 'duration';

export function sortModels<
  T extends ModelSummary & { balance?: number | null },
>(models: T[], key: ModelSortKey, direction: 'ascending' | 'descending') {
  const value = (model: T) => {
    if (key === 'economy') return economyRate(model.economy);
    if (key === 'model' || key === 'accuracy' || key === 'balance')
      return model[key] ?? null;
    return model[key].average;
  };
  return orderBy(
    models,
    [(model) => value(model) === null, value, 'model'],
    ['asc', direction === 'ascending' ? 'asc' : 'desc', 'asc'],
  );
}
