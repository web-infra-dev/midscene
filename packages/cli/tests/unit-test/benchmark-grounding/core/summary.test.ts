import {
  calculateReportChart,
  calculateReportOverview,
  formatEconomy,
} from '@/benchmark-grounding/core/overview';
import type {
  AttemptResult,
  Profile,
  ReportMeta,
  Result,
} from '@/benchmark-grounding/core/schemas';
import {
  calculateSummary,
  summarizeMetric,
} from '@/benchmark-grounding/core/summary';
import { describe, expect, it } from '@rstest/core';

const meta: ReportMeta = {
  models: {
    model: {
      displayFamily: 'Family',
      reference: {
        source: 'Public source',
        url: 'https://example.com',
        observedAt: '2026-11-12',
        pricing: { inputPerToken: 0.01, outputPerToken: 0.1 },
        performance: {
          timeToFirstTokenMs: 100,
          outputTokensPerSecond: 10,
        },
      },
    },
  },
  families: { Family: { color: '#123456' } },
};

function attempt(
  profile: Partial<Profile> = {},
  correct = true,
): AttemptResult {
  return {
    output: { type: 'POINT', center: [1, 1], correct },
    profiling: {
      durationMs: 1000,
      usageStatus: 'complete',
      calls: 1,
      totalPromptTokens: 10,
      totalCompletionTokens: 3,
      totalTokens: 13,
      ...profile,
    },
  };
}

function failedAttempt(
  profiling: Profile = { durationMs: 10, usageStatus: 'missing' },
): AttemptResult {
  return {
    output: {
      type: 'ERROR',
      correct: false,
      error: { name: 'Error', message: 'Request failed', retryable: true },
    },
    profiling,
  };
}

function result(name: string, attempts: AttemptResult[]): Result {
  return {
    schemaVersion: 1,
    consistency: { testcaseSha256: 'a'.repeat(64) },
    input: {
      testcase: name,
      model: 'api-model',
      family: 'qwen3',
      displayName: 'model',
      platform: 'web',
      instruction: 'find',
      groundTruth: [0, 2, 2, 0],
    },
    output: attempts.at(-1)!.output,
    profiling: { durationMs: 99999, usageStatus: 'complete' },
    attempts,
  };
}

function modelResult(
  model: string,
  name: string,
  final: AttemptResult,
): Result {
  const item = result(name, [final]);
  item.input.displayName = model;
  return item;
}

describe('precomputed report overview', () => {
  it('rounds Economy down to the number of whole cases', () => {
    expect(formatEconomy(1_234.99)).toBe('1,234 cases / $1');
    expect(formatEconomy(0.99)).toBe('0 cases / $1');
  });

  it('tabulates failed answers, execution errors and missing results distinctly', () => {
    const models = ['model', 'second'];
    const testcaseNames = ['incomplete', 'all-passed', 'all-failed', 'mixed'];
    const wrong = attempt({}, false);
    const results = [
      modelResult('model', 'all-passed', attempt()),
      modelResult('second', 'all-passed', attempt()),
      modelResult('model', 'all-failed', wrong),
      modelResult('second', 'all-failed', wrong),
      modelResult('model', 'mixed', wrong),
      modelResult('second', 'mixed', failedAttempt()),
      modelResult('model', 'incomplete', attempt()),
    ];
    const summary = calculateSummary({
      models,
      testcaseCount: testcaseNames.length,
      results,
    });

    const { matrix } = calculateReportOverview({
      summary,
      testcaseNames,
      results,
    });

    expect(matrix.models).toEqual(['second', 'model']);
    expect(matrix.counts).toEqual({
      all: 4,
      'all-passed': 1,
      'all-failed': 1,
      incomplete: 1,
    });
    expect(matrix.rows).toEqual([
      {
        name: 'all-failed',
        cells: ['failed', 'failed'],
        passed: 0,
        status: 'all-failed',
      },
      {
        name: 'all-passed',
        cells: ['passed', 'passed'],
        passed: 2,
        status: 'all-passed',
      },
      {
        name: 'incomplete',
        cells: ['missing', 'passed'],
        passed: 1,
        status: 'incomplete',
      },
      { name: 'mixed', cells: ['error', 'failed'], passed: 0, status: 'mixed' },
    ]);
    expect(matrix.accuracyDeviation).toBeCloseTo((50 - 100 / 3) / 2);
  });

  it('precomputes plot eligibility, cohort guides, radar, and ranking badges', () => {
    const paid = meta.models!.model.reference!;
    const completeMeta: ReportMeta = {
      models: {
        model: {
          displayFamily: 'Family',
          reference: { ...paid, performance: undefined },
        },
        free: {
          displayFamily: 'Family',
          reference: {
            ...paid,
            performance: undefined,
            pricing: { inputPerToken: 0, outputPerToken: 0 },
          },
        },
        unpriced: { displayFamily: 'Family' },
      },
    };
    const summary = calculateSummary({
      models: ['model', 'free', 'unpriced', 'timed-out', 'no-result'],
      testcaseCount: 2,
      results: [
        modelResult('model', 'one', attempt()),
        modelResult('model', 'two', attempt()),
        modelResult('free', 'one', attempt({ durationMs: 3000 })),
        modelResult('free', 'two', attempt({ durationMs: 3000 }, false)),
        modelResult('unpriced', 'one', attempt({ durationMs: 2000 })),
        modelResult('unpriced', 'two', attempt({ durationMs: 2000 }, false)),
        modelResult('timed-out', 'one', failedAttempt()),
      ],
      meta: completeMeta,
    });

    const chart = calculateReportChart(summary.models);

    expect(chart.scatter).toMatchObject({
      points: [
        {
          model: 'free',
          performance: 3,
          accuracy: 50,
          economy: 'free',
          balance: 0,
          badges: ['economy'],
        },
        {
          model: 'unpriced',
          performance: 2,
          accuracy: 50,
          economy: null,
          balance: null,
          badges: [],
        },
        {
          model: 'model',
          performance: 1,
          accuracy: 100,
          economy: 2.5,
          balance: 100,
          badges: ['performance', 'accuracy', 'balance'],
        },
      ],
      accuracyDomain: [0, 100],
      accuracyP50: 50,
      performanceP50: 2,
    });
    expect(chart.radar.models.map(({ balance }) => balance)).toEqual([
      100,
      0,
      null,
      null,
      null,
    ]);
    expect(chart.radar.models[0].data.map(({ metric }) => metric)).toEqual([
      'Accuracy',
      'Economy',
      'Performance',
    ]);
    expect(
      chart.radar.models.map(
        ({ data }) => data.find(({ metric }) => metric === 'Economy')?.value,
      ),
    ).toEqual([100, 100, null, null, null]);
    expect(chart.families).toEqual(['Family', 'Other']);
    expect(chart.familyWinners).toEqual(['model', 'timed-out']);
    expect(chart.budgetBounds).toEqual([0, 1000]);
  });
});

describe('grounding summary', () => {
  it('reports the earliest and latest testcase starts, including failed results', () => {
    const latest = result('latest', [attempt()]);
    latest.profiling.startTime = 1795511356984;
    const earliest = result('earliest', [failedAttempt()]);
    earliest.profiling.startTime = 1795511258465;
    const summary = calculateSummary({
      models: ['model', 'no-results'],
      testcaseCount: 3,
      results: [latest, result('undated', [attempt()]), earliest],
    });
    expect(summary.models.map(({ startTimeRange }) => startTimeRange)).toEqual([
      [1795511258465, 1795511356984],
      null,
    ]);
  });

  it('uses arithmetic means, keeps zero samples, and excludes invalid/missing values', () => {
    expect(
      summarizeMetric([
        0,
        2,
        100,
        null,
        undefined,
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ]),
    ).toEqual({ count: 3, average: 34, total: 102 });
    expect(summarizeMetric([])).toEqual({ count: 0, average: null, total: 0 });
  });

  it('uses the completed attempt for performance and economy', () => {
    const items = [
      result('one', [
        failedAttempt(attempt().profiling),
        attempt({
          durationMs: 4000,
          totalPromptTokens: 20,
          totalCompletionTokens: 7,
          totalTokens: 27,
        }),
      ]),
    ];
    const summary = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
      results: items,
      meta,
    });
    const model = summary.models[0];
    expect(model.duration).toEqual({ count: 1, total: 4000, average: 4000 });
    expect(model.inputTokens.average).toBe(30);
    expect(model.outputTokens.average).toBe(10);
    expect(model.totalTokens.average).toBe(40);
    expect(model.performance.average).toBe(0.8);
    expect(model.casesPerMinute).toBeCloseTo(60 / 0.8);
    expect(model.economyCount).toBe(1);
    expect(model.economy).toBeCloseTo(1 / 0.9);
    expect(model).toMatchObject({ modelId: 'api-model', total: 2, missing: 1 });
    expect(summary).toMatchObject({
      total: 2,
      count: 1,
      missing: 1,
      correct: 1,
      accuracy: 100,
    });
  });

  it('caps each testcase estimate at its measured duration before averaging', () => {
    const items = [
      result('one', [attempt({ durationMs: 200 })]),
      result('two', [attempt({ durationMs: 5000 })]),
    ];
    const model = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
      results: items,
      meta,
    }).models[0];
    expect(model.duration.average).toBe(2600);
    expect(model.performance).toEqual({
      count: 2,
      total: 0.6,
      average: 0.3,
    });
  });

  it.each([
    ['OpenRouter', 'https://openrouter.ai/model#performance'],
    ['Official pricing', 'https://example.com/model#performance'],
  ])(
    'uses one TTFT per call plus only output token time with %s data',
    (source, url) => {
      const custom = structuredClone(meta);
      const reference = custom.models!.model.reference!;
      reference.source = source;
      reference.performance = {
        timeToFirstTokenMs: 250,
        outputTokensPerSecond: 10,
        url,
      };
      const model = calculateSummary({
        models: ['model'],
        testcaseCount: 1,
        results: [
          result('one', [
            attempt({
              durationMs: 3000,
              calls: 2,
              totalPromptTokens: 10000,
              totalCompletionTokens: 3,
              totalTokens: 10003,
            }),
          ]),
        ],
        meta: custom,
      }).models[0];
      expect(model.performance.average).toBe(0.8);
    },
  );

  it.each([
    ['partial usage', { usageStatus: 'partial' }, meta],
    ['missing usage', { usageStatus: 'missing' }, meta],
    ['missing output tokens', { totalCompletionTokens: undefined }, meta],
    ['missing call count', { calls: undefined }, meta],
    ['missing performance reference', {}, undefined],
  ] satisfies [string, Partial<Profile>, ReportMeta | undefined][])(
    'falls back to measured duration for %s',
    (_reason, profile, referenceMeta) => {
      const model = calculateSummary({
        models: ['model'],
        testcaseCount: 1,
        results: [result('one', [attempt({ durationMs: 5000, ...profile })])],
        meta: referenceMeta,
      }).models[0];
      expect(model.performance).toEqual({
        count: 1,
        average: 5,
        total: 5,
      });
    },
  );

  it('counts incorrect answers and refusals in performance and economy when they complete', () => {
    const results = [
      result('wrong-point', [attempt({ durationMs: 100 }, false)]),
      result('wrong-refusal', [
        {
          output: { type: 'REFUSAL', correct: false },
          profiling: attempt({
            durationMs: 300,
            totalPromptTokens: 30,
            totalCompletionTokens: 5,
            totalTokens: 35,
          }).profiling,
        },
      ]),
      result('all-errors', [
        failedAttempt(attempt({ durationMs: 1 }).profiling),
      ]),
    ];
    const model = calculateSummary({
      models: ['model'],
      testcaseCount: results.length,
      results,
      meta,
    }).models[0];

    expect(model.duration).toEqual({ count: 2, average: 200, total: 400 });
    expect(model.performance).toEqual({ count: 2, average: 0.2, total: 0.4 });
    expect(model.economyCount).toBe(2);
    expect(model.economy).toBeCloseTo(2 / (40 * 0.01 + 8 * 0.1));
    expect(model.outputTokens.total).toBe(11);
    expect(model).toMatchObject({ passed: 0, errors: 1 });
  });

  it('estimates a successful third attempt even when earlier errors have incomplete usage', () => {
    const items = [
      result('one', [
        failedAttempt({
          durationMs: 30_000,
          usageStatus: 'partial',
          totalPromptTokens: 5,
        }),
        failedAttempt(),
        attempt({ durationMs: 3000, totalTokens: undefined }),
      ]),
      result('two', [failedAttempt()]),
    ];
    const summary = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
      results: items,
      meta,
    });
    const model = summary.models[0];
    expect(model.inputTokens).toEqual({ count: 1, total: 15, average: 15 });
    expect(model.economyCount).toBe(1);
    expect(model.economy).toBe(2.5);
    expect(model.duration).toEqual({ count: 1, average: 3000, total: 3000 });
    expect(model.performance).toEqual({
      count: 1,
      average: 0.4,
      total: 0.4,
    });
    expect(model.usage).toEqual({ complete: 0, partial: 1, missing: 1 });
    expect(summary).toMatchObject({ correct: 1, errors: 1, accuracy: 50 });
  });

  it('counts only first-token latency for calls with zero output tokens', () => {
    const model = calculateSummary({
      models: ['model'],
      testcaseCount: 1,
      results: [
        result('zero-output', [
          attempt({
            calls: 2,
            totalPromptTokens: 50,
            totalCompletionTokens: 0,
            totalTokens: 50,
          }),
        ]),
      ],
      meta,
    }).models[0];
    expect(model.performance.average).toBe(0.2);
  });

  it('uses measured duration for a latency-only reference', () => {
    const custom = structuredClone(meta);
    custom.models!.model.reference!.performance = {
      responseLatencyMs: 200,
    };
    const model = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
      results: [result('one', [attempt({ calls: 2 })])],
      meta: custom,
    }).models[0];
    expect(model.performance.average).toBe(1);
  });

  it('counts completed free cases and excludes incomplete paid usage from economy', () => {
    const custom = structuredClone(meta);
    custom.models!.model.reference!.pricing = {
      inputPerToken: 0,
      outputPerToken: 0,
    };
    const results = [
      result('one', [
        attempt({
          usageStatus: 'missing',
          totalPromptTokens: undefined,
          totalCompletionTokens: undefined,
          totalTokens: undefined,
        }),
      ]),
      result('two', [failedAttempt()]),
    ];
    const model = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
      results,
      meta: custom,
    }).models[0];
    const withoutPrice = calculateSummary({
      models: ['model'],
      testcaseCount: 1,
      results: [result('one', [attempt()])],
    }).models[0];
    const paid = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
      results,
      meta,
    }).models[0];
    expect(model.duration.average).toBe(1000);
    expect(model.performance).toEqual({ count: 1, average: 1, total: 1 });
    expect(model).toMatchObject({ economy: 'free', economyCount: 1 });
    expect(withoutPrice).toMatchObject({ economy: null, economyCount: 0 });
    expect(paid).toMatchObject({ economy: null, economyCount: 0 });
  });

  it('preserves captured model identities without results and never turns a zero denominator into infinity', () => {
    const empty = calculateSummary({
      models: ['model', 'other-model'],
      testcaseCount: 2,
      results: [],
      meta: { models: { model: { name: 'api-model-20261113' } } },
    });
    expect(empty.accuracy).toBeNull();
    expect(empty).toMatchObject({ total: 4, count: 0, missing: 4 });
    expect(empty.models).toHaveLength(2);
    expect(empty.models[0]).toMatchObject({
      model: 'model',
      modelId: 'api-model-20261113',
      total: 2,
      count: 0,
      missing: 2,
      accuracy: null,
      performance: { count: 0, average: null, total: 0 },
      casesPerMinute: null,
      economy: null,
      economyCount: 0,
    });
    expect(empty.models[1].modelId).toBeUndefined();
    const custom = structuredClone(meta);
    custom.models!.model.reference!.pricing = {
      inputPerToken: 0,
      outputPerToken: 0,
    };
    const zero = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
      results: [
        result('one', [
          attempt({
            durationMs: 0,
            calls: 0,
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            totalTokens: 0,
          }),
        ]),
      ],
      meta: custom,
    }).models[0];
    expect(zero.performance.average).toBe(0);
    expect(zero.casesPerMinute).toBeNull();
    expect(zero).toMatchObject({ economy: 'free', economyCount: 1 });
  });
});
