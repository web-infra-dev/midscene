import type { TestRunReportMetrics } from '@midscene/core';
import { sumTestRunReportMetrics } from '@midscene/core/internal/test-runner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CliModelUsage,
  configuredModelNames,
  formatTokenUsage,
  usageModelNames,
} from '../src/cli/model-usage';
import type { StepRunResult } from '../src/engine/types';

const metrics = (total = 120): TestRunReportMetrics => ({
  modelCallCount: 1,
  modelTimeMs: 100,
  promptTokens: total - 20,
  completionTokens: 20,
  cachedInputTokens: 80,
  totalTokens: total,
  models: [
    {
      modelName: 'actual-model',
      callCount: 1,
      modelCallTimeMs: 100,
      promptTokens: total - 20,
      completionTokens: 20,
      cachedInputTokens: 80,
      totalTokens: total,
    },
  ],
});
const result = (id: string, value?: TestRunReportMetrics): StepRunResult => ({
  phase: 'steps',
  stepIndex: 0,
  node: 'aiAct',
  input: {},
  meta: { continueOnError: false },
  status: 'success',
  continuedAfterError: false,
  startedAt: '',
  endedAt: '',
  durationMs: 1,
  report: {
    traces: [
      {
        type: 'midscene-execution',
        executionId: id,
        ...(value ? { metrics: value } : {}),
      },
    ],
  },
});
afterEach(() => vi.unstubAllEnvs());

describe('CLI model usage', () => {
  it('replaces execution snapshots and includes separate failed, retry and hook executions', () => {
    const usage = new CliModelUsage();
    expect(usage.snapshot()).toBeUndefined();
    usage.add(result('case-first', metrics()));
    usage.add(result('case-first', metrics(140)));
    usage.add(result('case-retry', metrics()));
    usage.add(result('beforeAll', metrics()));
    expect(usage.snapshot()).toMatchObject({
      modelCallCount: 3,
      totalTokens: 380,
      models: [{ modelName: 'actual-model', callCount: 3, totalTokens: 380 }],
    });
    expect(metrics().totalTokens).toBe(120);
    expect(usageModelNames(usage.snapshot())).toBe('actual-model');
  });
  it('marks missing usage as unknown and replaces it when a later snapshot arrives', () => {
    const usage = new CliModelUsage();
    usage.add(result('missing'));
    expect(formatTokenUsage(usage.snapshot())).toBe('— (usage unavailable)');
    usage.add(result('known', metrics()));
    expect(formatTokenUsage(usage.snapshot())).toContain(
      '≥120 total (partial)',
    );
    usage.add(result('missing', metrics()));
    expect(formatTokenUsage(usage.snapshot())).toBe(
      '240 total · 200 input (160 cached) · 40 output',
    );
  });
  it('never adds cached input to the total and distinguishes absent fields from zero', () => {
    expect(formatTokenUsage(metrics())).toBe(
      '120 total · 100 input (80 cached) · 20 output',
    );
    expect(formatTokenUsage(sumTestRunReportMetrics([]))).toBe(
      '0 (no model calls)',
    );
    const value = sumTestRunReportMetrics([metrics()]);
    value.collection!.fields!.promptTokens = 'unknown';
    expect(formatTokenUsage(value)).toContain('— input');
    expect(formatTokenUsage(undefined)).toBe('—');
  });
  it('groups environment model names by role without requiring API credentials', () => {
    vi.stubEnv('MIDSCENE_MODEL_NAME', 'default-model');
    vi.stubEnv('MIDSCENE_PLANNING_MODEL_NAME', 'planning-model');
    vi.stubEnv('MIDSCENE_INSIGHT_MODEL_NAME', '');
    expect(configuredModelNames()).toEqual([
      { name: 'default-model', intents: ['default', 'insight'] },
      { name: 'planning-model', intents: ['planning'] },
    ]);
    vi.stubEnv('MIDSCENE_MODEL_NAME', '');
    vi.stubEnv('MIDSCENE_PLANNING_MODEL_NAME', '');
    expect(configuredModelNames()).toEqual([]);
  });
});
