import { describe, expect, it } from '@rstest/core';
import {
  type EvaluationResult,
  type ModelSummary,
  type TestcaseView,
  compareNames,
  emptyFilters,
  filterTestcases,
  matrixRowStatus,
  resultKey,
  resultStatus,
  resultStatusLabel,
  selectModel,
  sortModels,
  testcasePath,
} from '../src/ui/types';
import { fixture } from './fixture';

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

function result(
  type: EvaluationResult['output']['type'],
  correct: boolean,
): EvaluationResult {
  const record = testcase('WEB-001', {
    groundTruth: type === 'REFUSAL' && correct ? 'REFUSAL' : [0, 1, 1, 0],
  });
  const output: EvaluationResult['output'] = {
    type,
    correct,
    ...(type === 'POINT' ? { center: correct ? [0.5, 0.5] : [2, 2] } : {}),
    ...(type === 'ERROR'
      ? {
          error: {
            name: 'FixtureError',
            message: 'Fixture failure',
            retryable: false,
          },
        }
      : {}),
  };
  const profiling: EvaluationResult['profiling'] = {
    durationMs: 0,
    usageStatus: 'missing',
  };
  return {
    schemaVersion: 1,
    consistency: { testcaseSha256: record.testcaseSha256 },
    input: {
      testcase: record.name,
      model: 'fixture',
      family: 'qwen3',
      displayName: 'Fixture',
      platform: record.platform,
      instruction: record.instruction.en,
      groundTruth: record.groundTruth,
    },
    output,
    profiling,
    attempts: [{ output, profiling }],
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
    planned: 2,
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
  it('uses dictionary order consistently, including numeric-looking suffixes', () => {
    expect(['WEB-2', 'WEB-10', 'MOBILE-1'].sort(compareNames)).toEqual([
      'MOBILE-1',
      'WEB-10',
      'WEB-2',
    ]);
  });

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

  it('keeps the input collection and ordering unchanged while filtering', () => {
    const cases = [testcase('WEB-002'), testcase('WEB-001')];
    expect(names(filterTestcases(cases, emptyFilters))).toEqual([
      'WEB-002',
      'WEB-001',
    ]);
    expect(names(cases)).toEqual(['WEB-002', 'WEB-001']);
  });

  it('round trips special testcase and model names through hash route paths', () => {
    const name = 'WEB #1? 中文';
    const modelName = 'provider/model + #?&';
    const path = testcasePath(name, modelName);
    const [pathname, search] = path.split('?');
    expect(decodeURIComponent(pathname.split('/').at(-1) as string)).toBe(name);
    expect(new URLSearchParams(search).get('model')).toBe(modelName);
    expect(testcasePath()).toBe('/testcases');
  });

  it('retains a selected model even when it has no result for the current case', () => {
    expect(selectModel(['Available', 'Missing'], 'Missing')).toBe('Missing');
    expect(selectModel(['Available', 'Missing'], 'Unknown')).toBe('Available');
    expect(selectModel([], null)).toBeUndefined();
  });

  it('uses unambiguous case/model keys rather than delimiter concatenation', () => {
    expect(resultKey('case:model', 'name')).not.toBe(
      resultKey('case', 'model:name'),
    );
    expect(resultKey('case', 'model')).toBe(resultKey('case', 'model'));
  });
});

describe('report outcomes and breakdown ordering', () => {
  it('distinguishes missing results, errors, incorrect predictions and passed refusals', () => {
    expect(resultStatus()).toBe('missing');
    expect(resultStatusLabel()).toBe('No result');
    expect(resultStatus(result('ERROR', false))).toBe('error');
    expect(resultStatus(result('POINT', false))).toBe('failed');
    expect(resultStatus(result('REFUSAL', true))).toBe('passed');
  });

  it('marks a matrix row incomplete before considering its other outcomes', () => {
    expect(matrixRowStatus([result('POINT', false), undefined])).toBe(
      'incomplete',
    );
    expect(matrixRowStatus([result('POINT', true), undefined])).toBe(
      'incomplete',
    );
    expect(matrixRowStatus([])).toBe('incomplete');
  });

  it('treats errors as failed matrix cells and distinguishes mixed rows', () => {
    expect(
      matrixRowStatus([result('ERROR', false), result('POINT', false)]),
    ).toBe('all-failed');
    expect(
      matrixRowStatus([result('REFUSAL', true), result('POINT', true)]),
    ).toBe('all-passed');
    expect(
      matrixRowStatus([result('POINT', true), result('POINT', false)]),
    ).toBe('mixed');
  });

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
