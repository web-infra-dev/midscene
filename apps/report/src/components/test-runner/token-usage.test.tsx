import type {
  ReportActionDump,
  TestRunReportMetrics,
  TestRunReportStep,
} from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlaywrightTasks } from '../../types';
import { TokenUsageDetails } from './token-usage';
import {
  getRecordedModelUsage,
  getRunTokenUsage,
  getStepsTokenUsage,
} from './token-usage-model';

const metrics: TestRunReportMetrics = {
  modelCallCount: 2,
  modelTimeMs: 100,
  promptTokens: 1_000,
  cachedInputTokens: 400,
  completionTokens: 100,
  totalTokens: 1_100,
  collection: {
    status: 'complete',
    expectedExecutionCount: 1,
    capturedExecutionCount: 1,
    reasons: [],
  },
};

const report = (reportId: string, executions: unknown[]): PlaywrightTasks => ({
  reportId,
  get: () => ({ executions }) as ReportActionDump,
  attributes: {
    playwright_test_description: '',
    playwright_test_id: reportId,
    playwright_test_title: reportId,
    playwright_test_status: 'passed',
    playwright_test_duration: 0,
  },
});

describe('model token usage details', () => {
  it('scopes recorded models to referenced executions across retries without counting duplicates or shared hooks', () => {
    const first = report('first', [
      {
        id: 'shared',
        tasks: [{ usage: { model_name: 'Shared model', total_tokens: 9_000 } }],
      },
      {
        id: 'other-case',
        tasks: [{ usage: { model_name: 'Other model', total_tokens: 9_000 } }],
      },
      {
        id: 'case',
        tasks: [
          {
            usage: {
              model_name: 'Model A',
              prompt_tokens: 1_000,
              cached_input: 400,
              completion_tokens: 100,
              total_tokens: 1_100,
            },
            searchAreaUsage: {
              model_name: 'Model B',
              prompt_tokens: 20,
              completion_tokens: 5,
              total_tokens: 25,
            },
          },
        ],
      },
    ]);
    const retry = report('retry', [
      {
        id: 'case',
        tasks: [
          {
            usage: {
              model_name: 'Model A',
              prompt_tokens: 600,
              cached_input: 200,
              completion_tokens: 100,
              total_tokens: 700,
            },
          },
        ],
      },
    ]);
    const details = [
      { reportId: 'first', executionId: 'case' },
      { reportId: 'first', executionId: 'case' },
      { reportId: 'retry', executionId: 'case' },
      { reportId: 'missing', executionId: 'case' },
    ];
    const models = getRecordedModelUsage([first, first, retry], details);
    expect(models).toHaveLength(2);
    expect(models).toContainEqual(
      expect.objectContaining({
        modelName: 'Model A',
        callCount: 2,
        totalTokens: 1_800,
        promptTokens: 1_600,
        cachedInputTokens: 600,
        completionTokens: 200,
      }),
    );
    expect(models).toContainEqual(
      expect.objectContaining({
        modelName: 'Model B',
        callCount: 1,
        totalTokens: 25,
      }),
    );
    expect(getRecordedModelUsage([first], [])).toEqual([]);
    expect(getRecordedModelUsage([first, first, retry])).toHaveLength(4);
  });

  it('keeps call and token collection statuses independent', () => {
    const withUnknownCalls: TestRunReportMetrics = {
      ...metrics,
      collection: {
        ...metrics.collection!,
        status: 'partial',
        fields: {
          modelCallCount: 'unknown',
          totalTokens: 'complete',
          modelTimeMs: 'complete',
        },
      },
    };
    const usage = getStepsTokenUsage([
      { status: 'success', metrics: withUnknownCalls } as TestRunReportStep,
    ]);
    expect(usage).toMatchObject({
      status: 'complete',
      totalTokens: 1_100,
      modelCallCount: 0,
      callStatus: 'unknown',
    });
    const markup = renderToStaticMarkup(
      <TokenUsageDetails usage={usage} models={[]} />,
    );
    expect(markup).toContain('<dt>Model calls</dt><dd>—</dd>');
    expect(markup).toContain('<dt>Total tokens</dt><dd>1,100</dd>');
  });

  it('shows unavailable usage honestly and retains independent field availability', () => {
    const unknown = getRunTokenUsage({ ...metrics, collection: undefined });
    expect(unknown).toMatchObject({ status: 'unknown', callStatus: 'unknown' });
    const markup = renderToStaticMarkup(
      <TokenUsageDetails usage={unknown} models={[]} />,
    );
    expect(markup).toContain('Model details not recorded.');
    expect(markup).toContain('<dt>Input tokens</dt><dd>—</dd>');
    expect(markup).not.toContain('1,100');
    const knownTokens = getRunTokenUsage({
      ...metrics,
      collection: {
        ...metrics.collection!,
        status: 'unknown',
        fields: {
          totalTokens: 'complete',
          modelCallCount: 'unknown',
          modelTimeMs: 'unknown',
        },
      },
    });
    expect(knownTokens).toMatchObject({
      status: 'complete',
      callStatus: 'unknown',
    });
  });

  it('shows input, cached input, output and partial totals without adding cached input twice', () => {
    const usage = getRunTokenUsage({
      ...metrics,
      collection: { ...metrics.collection!, status: 'partial' },
    });
    const markup = renderToStaticMarkup(
      <TokenUsageDetails usage={usage} models={[]} />,
    );
    const text = markup.replace(/<[^>]*>/g, '');
    expect(text).toContain('Input tokens1,000 (partial)');
    expect(text).toContain('Cached input tokens400 (partial)');
    expect(text).toContain('Output tokens100 (partial)');
    expect(text).toContain('Total tokens1,100 (partial)');
  });
});
