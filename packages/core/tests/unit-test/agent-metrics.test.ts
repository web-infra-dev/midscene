import { Agent } from '@/agent';
import { MetricsCollector } from '@/agent/metrics';
import type { AIUsageInfo, ExecutionDump } from '@/types';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('openai');

const modelConfig = {
  [MIDSCENE_MODEL_NAME]: 'test-model',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.test.com/v1',
};

function createMockInterface() {
  return {
    interfaceType: 'puppeteer',
    actionSpace: () => [],
    describe: () => 'test page',
    size: async () => ({ width: 1280, height: 720 }),
    screenshotBase64: async () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
  } as any;
}

function usage(overrides: Partial<AIUsageInfo>): AIUsageInfo {
  return {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cached_input: 0,
    time_cost: 0,
    model_name: undefined,
    model_description: undefined,
    response_model_name: undefined,
    intent: undefined,
    slot: undefined,
    request_id: undefined,
    ...overrides,
  };
}

function dumpWithTasks(tasks: any[]): ExecutionDump {
  return { id: 'exec', name: 'exec', tasks } as unknown as ExecutionDump;
}

describe('MetricsCollector', () => {
  it('aggregates totals and breaks down by intent and model', () => {
    const collector = new MetricsCollector();
    collector.add(
      usage({
        prompt_tokens: 100,
        completion_tokens: 40,
        total_tokens: 140,
        cached_input: 10,
        time_cost: 500,
        intent: 'planning',
        model_name: 'model-a',
      }),
    );
    collector.add(
      usage({
        prompt_tokens: 60,
        completion_tokens: 20,
        total_tokens: 80,
        cached_input: 5,
        time_cost: 300,
        intent: 'insight',
        model_name: 'model-a',
      }),
    );

    const snapshot = collector.snapshot();
    expect(snapshot.totalPromptTokens).toBe(160);
    expect(snapshot.totalCompletionTokens).toBe(60);
    expect(snapshot.totalTokens).toBe(220);
    expect(snapshot.totalCachedInput).toBe(15);
    expect(snapshot.totalTimeCostMs).toBe(800);
    expect(snapshot.calls).toBe(2);

    expect(snapshot.byIntent.planning).toEqual({
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
      calls: 1,
    });
    expect(snapshot.byIntent.insight.calls).toBe(1);
    expect(snapshot.byModel['model-a']).toEqual({
      promptTokens: 160,
      completionTokens: 60,
      totalTokens: 220,
      calls: 2,
    });
  });

  it('treats missing token fields as zero and missing labels as "unknown"', () => {
    const collector = new MetricsCollector();
    collector.add(usage({}));
    const snapshot = collector.snapshot();
    expect(snapshot.totalTokens).toBe(0);
    expect(snapshot.calls).toBe(1);
    expect(snapshot.byIntent.unknown.calls).toBe(1);
    expect(snapshot.byModel.unknown.calls).toBe(1);
  });

  it('returns an independent snapshot that does not mutate on further adds', () => {
    const collector = new MetricsCollector();
    collector.add(usage({ total_tokens: 10, intent: 'planning' }));
    const first = collector.snapshot();
    collector.add(usage({ total_tokens: 10, intent: 'planning' }));
    expect(first.totalTokens).toBe(10);
    expect(first.byIntent.planning.calls).toBe(1);
  });

  it('clears all accumulated state on reset', () => {
    const collector = new MetricsCollector();
    collector.add(usage({ total_tokens: 10 }));
    collector.reset();
    const snapshot = collector.snapshot();
    expect(snapshot.totalTokens).toBe(0);
    expect(snapshot.calls).toBe(0);
    expect(snapshot.byIntent).toEqual({});
    expect(snapshot.byModel).toEqual({});
  });
});

describe('Agent usage metrics', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('counts each task usage once across re-emitted snapshots', async () => {
    const agent = new Agent(createMockInterface(), {
      modelConfig,
      generateReport: false,
    });

    const task = {
      taskId: 't1',
      usage: usage({ total_tokens: 50, intent: 'planning' }),
    };

    // Same task surfaces in multiple snapshots; usage must not double-count.
    (agent as any).collectUsageMetrics(dumpWithTasks([task]));
    (agent as any).collectUsageMetrics(dumpWithTasks([task]));

    expect(agent.metrics.totalTokens).toBe(50);
    expect(agent.metrics.calls).toBe(1);

    await agent.destroy();
  });

  it('counts both usage and searchAreaUsage of a task', async () => {
    const agent = new Agent(createMockInterface(), {
      modelConfig,
      generateReport: false,
    });

    (agent as any).collectUsageMetrics(
      dumpWithTasks([
        {
          taskId: 't1',
          usage: usage({ total_tokens: 50, intent: 'insight' }),
          searchAreaUsage: usage({ total_tokens: 20, intent: 'insight' }),
        },
      ]),
    );

    expect(agent.metrics.totalTokens).toBe(70);
    expect(agent.metrics.calls).toBe(2);

    await agent.destroy();
  });

  it('counts usage that is filled in on a later snapshot', async () => {
    const agent = new Agent(createMockInterface(), {
      modelConfig,
      generateReport: false,
    });

    (agent as any).collectUsageMetrics(
      dumpWithTasks([{ taskId: 't1', usage: undefined }]),
    );
    expect(agent.metrics.calls).toBe(0);

    (agent as any).collectUsageMetrics(
      dumpWithTasks([{ taskId: 't1', usage: usage({ total_tokens: 30 }) }]),
    );
    expect(agent.metrics.calls).toBe(1);
    expect(agent.metrics.totalTokens).toBe(30);

    await agent.destroy();
  });

  it('resetMetrics clears totals and re-allows previously counted tasks', async () => {
    const agent = new Agent(createMockInterface(), {
      modelConfig,
      generateReport: false,
    });

    const task = {
      taskId: 't1',
      usage: usage({ total_tokens: 50, intent: 'planning' }),
    };
    (agent as any).collectUsageMetrics(dumpWithTasks([task]));
    expect(agent.metrics.totalTokens).toBe(50);

    agent.resetMetrics();
    expect(agent.metrics.totalTokens).toBe(0);
    expect(agent.metrics.calls).toBe(0);

    // After reset, the dedup memory is cleared so a fresh run is counted again.
    (agent as any).collectUsageMetrics(dumpWithTasks([task]));
    expect(agent.metrics.totalTokens).toBe(50);

    await agent.destroy();
  });

  it('invokes the onLLMUsage callback once per usage', async () => {
    const onLLMUsage = vi.fn();
    const agent = new Agent(createMockInterface(), {
      modelConfig,
      generateReport: false,
      onLLMUsage,
    });

    const task = {
      taskId: 't1',
      usage: usage({ total_tokens: 50, intent: 'planning' }),
    };
    (agent as any).collectUsageMetrics(dumpWithTasks([task]));
    (agent as any).collectUsageMetrics(dumpWithTasks([task]));

    expect(onLLMUsage).toHaveBeenCalledTimes(1);
    expect(onLLMUsage).toHaveBeenCalledWith(
      expect.objectContaining({ total_tokens: 50, intent: 'planning' }),
    );

    await agent.destroy();
  });
});
