import { describe, expect, it } from '@rstest/core';
import {
  type ModelSummary,
  type TestcaseView,
  emptyFilters,
  filterTestcases,
  sortModels,
  testcasePath,
} from '../../src/ui/types';
import { fixture } from '../fixture';

function testcase(
  name: string,
  overrides: Partial<TestcaseView> = {},
): TestcaseView {
  const record = fixture(name, {
    instruction: { en: 'Tap the blue settings button', zh: '点击蓝色设置按钮' },
    ...overrides,
  });
  return {
    ...record.testcase,
    image: `data:image/png;base64,${record.files['image.png'].toString('base64')}`,
    testcaseSha256: record.testcaseSha256,
    indexJson: record.files['index.json'].toString('utf8'),
    indexSha256: record.files['index.sha256'].toString('utf8'),
  };
}

function model(
  name: string,
  score: number | null,
  duration: number | null = null,
): ModelSummary {
  const metric = { average: null, count: 0, total: 0 };
  return {
    model: name,
    modelId: name,
    family: 'Other',
    color: '#64748b',
    total: 2,
    count: score === null ? 0 : 2,
    missing: score === null ? 2 : 0,
    passed: score ? 2 : 0,
    errors: 0,
    score,
    duration: { ...metric, average: duration },
    inputTokens: metric,
    outputTokens: metric,
    totalTokens: metric,
    estimatedElapsedTime: metric,
    estimatedCost: metric,
    speed: null,
    affordability: null,
    usage: { complete: 0, partial: 0, missing: 0 },
  };
}

const names = (items: { name: string }[]) => items.map((item) => item.name);

describe('offline testcase navigation', () => {
  it('searches all terms across case names and both instruction languages', () => {
    const cases = [
      testcase('WEB-001'),
      testcase('WEB-002', {
        instruction: { en: 'Tap a red icon', zh: '点击红色图标' },
      }),
    ];
    expect(
      names(
        filterTestcases(cases, {
          ...emptyFilters,
          search: '  WEB-001  BLUE   设置  ',
        }),
      ),
    ).toEqual(['WEB-001']);
    expect(
      filterTestcases(cases, { ...emptyFilters, search: 'blue red' }),
    ).toEqual([]);
  });

  it('combines platform, category, source and expected outcome filters', () => {
    const cases = [
      testcase('WEB-001'),
      testcase('MOBILE-001', {
        platform: 'mobile',
        category: { item: 'Refusal', reason: 'No target' },
        groundTruth: 'REFUSAL',
      }),
    ];
    expect(
      names(
        filterTestcases(cases, {
          ...emptyFilters,
          platform: 'mobile',
          category: 'Refusal',
          dataset: 'fixture',
          outcome: 'refusal',
        }),
      ),
    ).toEqual(['MOBILE-001']);
    expect(
      names(filterTestcases(cases, { ...emptyFilters, outcome: 'point' })),
    ).toEqual(['WEB-001']);
    expect(
      filterTestcases(cases, { ...emptyFilters, dataset: 'Missing source' }),
    ).toEqual([]);
  });

  it('preserves filters and unrelated parameters when navigating or switching models', () => {
    const query =
      '?platform=web&category=Basic+Element&search=%E4%B8%AD%E6%96%87&model=Old&extra=keep';
    const path = testcasePath('WEB #2', 'New model + #', query);
    const params = new URLSearchParams(path.slice(path.indexOf('?')));
    expect(params.get('model')).toBe('New model + #');
    expect(params.get('extra')).toBe('keep');
    expect(params.has('search')).toBe(false);
    expect(params.get('platform')).toBe('web');
    expect(params.get('category')).toBe('Basic Element');
    expect(
      new URLSearchParams(
        testcasePath('WEB-3', undefined, query).split('?')[1],
      ).get('model'),
    ).toBe('Old');
  });
});

describe('model breakdown ordering', () => {
  it('sorts actual zero scores before unavailable values in both directions', () => {
    const models = [
      model('Missing', null),
      model('Zero', 0),
      model('Passed', 100),
    ];
    expect(
      sortModels(models, 'score', 'descending').map((item) => item.model),
    ).toEqual(['Passed', 'Zero', 'Missing']);
    expect(
      sortModels(models, 'score', 'ascending').map((item) => item.model),
    ).toEqual(['Zero', 'Passed', 'Missing']);
    expect(models.map((item) => item.model)).toEqual([
      'Missing',
      'Zero',
      'Passed',
    ]);
  });

  it('sorts metric averages, leaves unavailable metrics last, and breaks ties by model name', () => {
    const models = [
      model('Z', 50, 10),
      model('Missing', 50),
      model('A', 50, 10),
      model('Zero', 50, 0),
    ];
    expect(
      sortModels(models, 'duration', 'ascending').map((item) => item.model),
    ).toEqual(['Zero', 'A', 'Z', 'Missing']);
    expect(
      sortModels(models, 'duration', 'descending').map((item) => item.model),
    ).toEqual(['A', 'Z', 'Zero', 'Missing']);
    expect(
      sortModels(models, 'model', 'ascending').map((item) => item.model),
    ).toEqual(['A', 'Missing', 'Z', 'Zero']);
  });
});
