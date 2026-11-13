import { describe, expect, it } from '@rstest/core';
import type {
  AttemptResult,
  Profile,
  ReportMeta,
  Result,
  RunManifest,
} from '../../src/core/schemas';
import { calculateSummary, summarizeMetric } from '../../src/core/summary';

const run: RunManifest = {
  schemaVersion: 1,
  id: 'test',
  startedAt: '2026-11-12T00:00:00Z',
  status: 'completed',
  planned: 2,
  completed: 2,
  versions: { package: '1', sdk: '1' },
  options: { concurrency: 1, retries: 2, timeoutMs: 60000 },
  models: [
    {
      name: 'api-model',
      family: 'qwen3',
      displayName: 'model',
      directory: 'model',
    },
  ],
  testcases: [
    { name: 'one', testcaseSha256: 'a'.repeat(64) },
    { name: 'two', testcaseSha256: 'b'.repeat(64) },
  ],
  tasks: [
    { model: 'model', testcase: 'one' },
    { model: 'model', testcase: 'two' },
  ],
};
const meta: ReportMeta = {
  models: {
    model: {
      displayFamily: 'Family',
      reference: {
        source: 'Public source',
        url: 'https://example.com',
        observedAt: '2026-11-12',
        pricing: { currency: 'USD', inputPerToken: 0.01, outputPerToken: 0.1 },
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

describe('grounding summary', () => {
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

  it('includes every retry in duration, usage, and separately priced input/output cost', () => {
    const items = [
      result('one', [
        attempt({}, false),
        attempt({
          durationMs: 2000,
          totalPromptTokens: 20,
          totalCompletionTokens: 7,
          totalTokens: 27,
        }),
      ]),
    ];
    const summary = calculateSummary({ run, results: items, meta });
    const model = summary.models[0];
    expect(model.duration).toEqual({ count: 1, total: 3000, average: 3000 });
    expect(model.inputTokens.average).toBe(30);
    expect(model.outputTokens.average).toBe(10);
    expect(model.totalTokens.average).toBe(40);
    expect(model.estimatedCost.average).toBeCloseTo(1.3);
    expect(model.estimatedElapsedTime.average).toBe(1000);
    expect(model.speed).toBe(60);
    expect(model.affordability).toBeCloseTo(1 / 1.3);
    expect(summary).toMatchObject({
      completed: 1,
      missing: 1,
      correct: 1,
      score: 100,
    });
  });

  it('applies the 100ms correction after independently averaging the two metrics', () => {
    const items = [
      result('one', [attempt({ durationMs: 200, totalCompletionTokens: 10 })]),
      result('two', [attempt({ durationMs: 5000, totalCompletionTokens: 1 })]),
    ];
    const model = calculateSummary({ run, results: items, meta }).models[0];
    expect(model.duration.average).toBe(2600);
    expect(model.estimatedElapsedTime.average).toBe(550);
  });

  it.each([
    [100, 0],
    [101, 1],
    [1000, 300],
  ])('corrects measured %sms to estimated %sms', (durationMs, expected) => {
    const model = calculateSummary({
      run,
      results: [result('one', [attempt({ durationMs })])],
      meta,
    }).models[0];
    expect(model.estimatedElapsedTime).toEqual({
      count: 1,
      average: expected,
      total: expected,
    });
    expect(model.speed).toBe(expected === 0 ? null : 60000 / expected);
  });

  it('retains partial known usage but excludes incomplete attempts from complete cost and duration estimates', () => {
    const items = [
      result('one', [
        attempt({ usageStatus: 'partial', totalPromptTokens: 5 }),
        attempt(),
      ]),
      result('two', [
        {
          output: {
            type: 'ERROR',
            correct: false,
            error: { name: 'Timeout', message: 'timed out', retryable: true },
          },
          profiling: { durationMs: 60000, usageStatus: 'missing' },
        },
      ]),
    ];
    const summary = calculateSummary({ run, results: items, meta });
    const model = summary.models[0];
    expect(model.inputTokens).toEqual({ count: 1, total: 15, average: 15 });
    expect(model.estimatedCost).toEqual({ count: 0, average: null, total: 0 });
    expect(model.estimatedElapsedTime.count).toBe(0);
    expect(model.usage).toEqual({ complete: 0, partial: 1, missing: 1 });
    expect(summary).toMatchObject({ correct: 1, errors: 1, score: 50 });
  });

  it('converts CNY with the captured exchange rate and supports response-latency reference models', () => {
    const custom = structuredClone(meta);
    custom.models!.model.reference!.pricing = {
      currency: 'CNY',
      inputPerToken: 1,
      outputPerToken: 2,
      usdExchangeRate: {
        source: 'FX',
        url: 'https://example.com/fx',
        quotedAt: '2026-11-12',
        cnyPerUsd: 10,
      },
    };
    custom.models!.model.reference!.performance = {
      responseLatencyMs: 200,
    };
    const model = calculateSummary({
      run,
      results: [result('one', [attempt({ calls: 2 })])],
      meta: custom,
    }).models[0];
    expect(model.estimatedCost.average).toBe(1.6);
    expect(model.estimatedElapsedTime.average).toBe(400);
  });

  it('shows models without metadata or results and never turns a zero denominator into infinity', () => {
    const empty = calculateSummary({ run, results: [] });
    expect(empty.score).toBeNull();
    expect(empty.models[0]).toMatchObject({
      model: 'model',
      count: 0,
      missing: 2,
      score: null,
      speed: null,
      affordability: null,
    });
    const custom = structuredClone(meta);
    custom.models!.model.reference!.pricing = {
      currency: 'USD',
      inputPerToken: 0,
      outputPerToken: 0,
    };
    const zero = calculateSummary({
      run,
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
    expect(zero.estimatedCost.average).toBe(0);
    expect(zero.estimatedElapsedTime.average).toBe(0);
    expect(zero.speed).toBeNull();
    expect(zero.affordability).toBeNull();
  });
});
