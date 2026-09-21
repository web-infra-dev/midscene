import { describe, expect, it } from '@rstest/core';
import { collectReportSummary } from '../../src/report-stats';
import type {
  AIUsageInfo,
  ExecutionTask,
  IReportActionDump,
} from '../../src/types';

function createUsage(overrides: Partial<AIUsageInfo>): AIUsageInfo {
  return {
    prompt_tokens: undefined,
    completion_tokens: undefined,
    total_tokens: undefined,
    cached_input: undefined,
    time_cost: undefined,
    model_name: undefined,
    model_description: undefined,
    response_model_name: undefined,
    intent: undefined,
    slot: undefined,
    request_id: undefined,
    ...overrides,
  };
}

function createTask(overrides: Partial<ExecutionTask> = {}): ExecutionTask {
  return {
    taskId: 'task',
    type: 'Log',
    status: 'finished',
    executor: async () => {},
    ...overrides,
  };
}

function createReport(
  tasks: ExecutionTask[],
): Pick<IReportActionDump, 'executions'> {
  return {
    executions: [
      {
        logTime: 100,
        name: 'execution',
        tasks,
      },
    ],
  };
}

describe('collectReportSummary', () => {
  it('aggregates elapsed time, model call time, and tokens with search-area calls attributed to their own models', () => {
    const report = createReport([
      createTask({
        taskId: 'task-1',
        timing: { start: 100, end: 300 },
        usage: createUsage({
          model_name: 'alpha',
          prompt_tokens: 10,
          cached_input: 2,
          completion_tokens: 3,
          total_tokens: 13,
          time_cost: 80,
        }),
        searchAreaUsage: createUsage({
          model_name: 'beta',
          prompt_tokens: 4,
          completion_tokens: 1,
          time_cost: 30,
        }),
      }),
      createTask({
        taskId: 'task-2',
        timing: { start: 250, end: 500 },
        usage: createUsage({
          model_name: 'alpha',
          prompt_tokens: 5,
          completion_tokens: 2,
          time_cost: 90,
        }),
      }),
      createTask({
        taskId: 'task-3',
        timing: { start: 150, end: 450 },
        searchAreaUsage: createUsage({
          model_name: 'gamma',
          prompt_tokens: 7,
          completion_tokens: 1,
          time_cost: 20,
        }),
      }),
    ]);

    expect(collectReportSummary(report)).toEqual({
      timing: {
        wallTimeMs: 400,
        wallTimeStart: 100,
        wallTimeEnd: 500,
        wallTimeSource: 'task-timestamps',
        modelCallTimeMs: 220,
        modelCallCount: 4,
      },
      tokens: {
        promptTokens: 26,
        cachedInputTokens: 2,
        completionTokens: 7,
        totalTokens: 33,
      },
      models: [
        {
          modelName: 'alpha',
          callCount: 2,
          promptTokens: 15,
          cachedInputTokens: 2,
          completionTokens: 5,
          totalTokens: 20,
          modelCallTimeMs: 170,
        },
        {
          modelName: 'beta',
          callCount: 1,
          promptTokens: 4,
          cachedInputTokens: 0,
          completionTokens: 1,
          totalTokens: 5,
          modelCallTimeMs: 30,
        },
        {
          modelName: 'gamma',
          callCount: 1,
          promptTokens: 7,
          cachedInputTokens: 0,
          completionTokens: 1,
          totalTokens: 8,
          modelCallTimeMs: 20,
        },
      ],
    });
  });

  it('uses the elapsed-time fallback only when task timestamps are unavailable', () => {
    const noTiming = collectReportSummary(createReport([createTask()]), {
      wallTimeFallbackMs: 1_234,
    });
    const withTiming = collectReportSummary(
      createReport([createTask({ timing: { start: 20, end: 70 } })]),
      { wallTimeFallbackMs: 1_234 },
    );

    expect(noTiming.timing).toMatchObject({
      wallTimeMs: 1_234,
      wallTimeSource: 'fallback',
    });
    expect(withTiming.timing).toMatchObject({
      wallTimeMs: 50,
      wallTimeStart: 20,
      wallTimeEnd: 70,
      wallTimeSource: 'task-timestamps',
    });
  });

  it('reports unavailable elapsed time and zero model time when no data exists', () => {
    expect(collectReportSummary(createReport([]))).toEqual({
      timing: {
        wallTimeMs: undefined,
        wallTimeStart: undefined,
        wallTimeEnd: undefined,
        wallTimeSource: 'unavailable',
        modelCallTimeMs: 0,
        modelCallCount: 0,
      },
      tokens: {
        promptTokens: 0,
        cachedInputTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      models: [],
    });
  });

  it('throws when executions are not an array', () => {
    expect(() =>
      collectReportSummary({ executions: null } as unknown as Pick<
        IReportActionDump,
        'executions'
      >),
    ).toThrow('collectReportSummary: report.executions must be an array');
  });
});
