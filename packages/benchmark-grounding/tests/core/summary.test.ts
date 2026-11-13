import { describe, expect, it } from '@rstest/core';
import type {
  AttemptResult,
  Profile,
  ReportMeta,
  Result,
} from '../../src/core/schemas';
import { calculateSummary, summarizeMetric } from '../../src/core/summary';

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
    const summary = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
      results: items,
      meta,
    });
    const model = summary.models[0];
    expect(model.duration).toEqual({ count: 1, total: 3000, average: 3000 });
    expect(model.inputTokens.average).toBe(30);
    expect(model.outputTokens.average).toBe(10);
    expect(model.totalTokens.average).toBe(40);
    expect(model.estimatedCost.average).toBeCloseTo(1.3);
    expect(model.estimatedElapsedTime.average).toBe(1000);
    expect(model.speed).toBe(60);
    expect(model.affordability).toBeCloseTo(1 / 1.3);
    expect(model).toMatchObject({ modelId: 'api-model', total: 2, missing: 1 });
    expect(summary).toMatchObject({
      total: 2,
      count: 1,
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
    const model = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
      results: items,
      meta,
    }).models[0];
    expect(model.duration.average).toBe(2600);
    expect(model.estimatedElapsedTime.average).toBe(550);
  });

  it.each([
    [100, 0],
    [101, 1],
    [1000, 300],
  ])('corrects measured %sms to estimated %sms', (durationMs, expected) => {
    const model = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
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
    const summary = calculateSummary({
      models: ['model'],
      testcaseCount: 2,
      results: items,
      meta,
    });
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
      models: ['model'],
      testcaseCount: 2,
      results: [result('one', [attempt({ calls: 2 })])],
      meta: custom,
    }).models[0];
    expect(model.estimatedCost.average).toBe(1.6);
    expect(model.estimatedElapsedTime.average).toBe(400);
  });

  it('preserves captured model identities without results and never turns a zero denominator into infinity', () => {
    const empty = calculateSummary({
      models: ['model', 'other-model'],
      testcaseCount: 2,
      results: [],
      meta: { models: { model: { name: 'api-model-20261113' } } },
    });
    expect(empty.score).toBeNull();
    expect(empty).toMatchObject({ total: 4, count: 0, missing: 4 });
    expect(empty.models).toHaveLength(2);
    expect(empty.models[0]).toMatchObject({
      model: 'model',
      modelId: 'api-model-20261113',
      total: 2,
      count: 0,
      missing: 2,
      score: null,
      speed: null,
      affordability: null,
    });
    expect(empty.models[1].modelId).toBeUndefined();
    const custom = structuredClone(meta);
    custom.models!.model.reference!.pricing = {
      currency: 'USD',
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
    expect(zero.estimatedCost.average).toBe(0);
    expect(zero.estimatedElapsedTime.average).toBe(0);
    expect(zero.speed).toBeNull();
    expect(zero.affordability).toBeNull();
  });
});
