import { TaskExecutor } from '@/agent/tasks';
import { getMidsceneLocationSchema } from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import type { ModelRuntime } from '@/ai-model/models/types';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { DeviceAction, ExecutorContext } from '@/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type Service from '../../src';

vi.mock('@/ai-model/workflows/planning', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/ai-model/workflows/planning')>();
  return {
    ...actual,
    genericXmlPlan: vi.fn(),
  };
});

import { genericXmlPlan } from '@/ai-model/workflows/planning';

const validBase64Image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
};

const planningModel = () =>
  getModelRuntime({
    modelName: 'planning-model',
    modelDescription: 'planning-model',
    intent: 'planning',
    slot: 'planning',
  });
const defaultModel = () =>
  getModelRuntime({
    modelName: 'default-model',
    modelDescription: 'default-model',
    intent: 'default',
    slot: 'default',
  });
const emptyParamActionSpace: DeviceAction[] = [
  {
    name: 'Noop',
    description: 'noop',
    paramSchema: z.object({}),
    call: async () => undefined,
  },
];

describe('TaskExecutor concurrency isolation', () => {
  let taskExecutor: TaskExecutor;
  let mockInterface: AbstractInterface;
  let mockService: Service;

  beforeEach(() => {
    mockInterface = {
      interfaceType: 'web',
      actionSpace: vi.fn().mockReturnValue(emptyParamActionSpace),
    } as unknown as AbstractInterface;

    mockService = {
      contextRetrieverFn: vi.fn().mockResolvedValue({
        screenshot: ScreenshotItem.create(validBase64Image, Date.now()),
        shotSize: { width: 1920, height: 1080 },
        shrunkShotToLogicalRatio: 1,
        tree: {
          id: 'root',
          attributes: {},
          children: [],
        },
      }),
    } as unknown as Service;

    taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: emptyParamActionSpace,
    });

    vi.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
      yamlFlow: [],
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should isolate conversation history between concurrent action calls', async () => {
    const waitForBothCalls = createDeferred();
    const releasePlans = createDeferred();

    const seenHistories: any[] = [];

    vi.mocked(genericXmlPlan).mockImplementation(
      async (_instruction, opts: any) => {
        seenHistories.push(opts.conversationHistory);
        if (seenHistories.length === 2) {
          waitForBothCalls.resolve();
        }

        if (seenHistories.length < 2) {
          await releasePlans.promise;
        }

        return {
          actions: [],
          yamlFlow: [],
          shouldContinuePlanning: false,
          log: '',
          rawResponse: '',
          finalizeSuccess: true,
          finalizeMessage: 'done',
        };
      },
    );

    const actionPromiseA = taskExecutor.action(
      'first prompt',
      planningModel(),
      defaultModel(),
      true,
    );
    const actionPromiseB = taskExecutor.action(
      'second prompt',
      planningModel(),
      defaultModel(),
      true,
    );

    await waitForBothCalls.promise;
    expect(seenHistories).toHaveLength(2);
    expect(seenHistories[0]).not.toBe(seenHistories[1]);

    releasePlans.resolve();
    await Promise.all([actionPromiseA, actionPromiseB]);
  });

  it('isolates aiAct progress between concurrent action calls on one executor', async () => {
    // Two concurrent action() calls share one executor. Call A is held mid-
    // action while call B runs to completion (and tears down its own batch
    // state). The per-call reporter must stay isolated so A still reports its
    // own action_done with its own plan limit after B finishes.
    const aInBatch = createDeferred();
    const releaseA = createDeferred();

    const progress: Array<{
      phase: string;
      name?: string;
      planLimit?: number;
    }> = [];

    const taskExecutorLocal = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: emptyParamActionSpace,
      hooks: {
        onProgress: (_scope, phase, data) => {
          const payload = (data ?? {}) as Record<string, any>;
          progress.push({
            phase,
            name: payload.action?.name,
            planLimit: payload.planLimit,
          });
        },
      },
    });

    vi.mocked(genericXmlPlan).mockImplementation(async (instruction: any) => {
      // Gate B's plan until A is executing inside its action batch, so the
      // two batches are guaranteed to overlap.
      if (instruction === 'B') {
        await aInBatch.promise;
      }
      return {
        actions: [{ type: instruction === 'A' ? 'TapA' : 'TapB', param: {} }],
        yamlFlow: [],
        shouldContinuePlanning: false,
        log: '',
        rawResponse: '',
        finalizeSuccess: true,
        finalizeMessage: 'done',
      } as any;
    });

    vi.spyOn(taskExecutorLocal, 'convertPlanToExecutable').mockImplementation(
      (async (plans: any[]) => {
        const type = plans[0]?.type;
        if (type === 'TapA') {
          return {
            tasks: [
              {
                type: 'Action Space',
                subType: 'TapA',
                param: {},
                executor: async () => {
                  aInBatch.resolve();
                  await releaseA.promise;
                  return undefined;
                },
              },
            ],
            yamlFlow: [],
          };
        }
        return {
          tasks: [
            {
              type: 'Action Space',
              subType: 'TapB',
              param: {},
              executor: async () => undefined,
            },
          ],
          yamlFlow: [],
        };
      }) as any,
    );

    const promiseA = taskExecutorLocal.action(
      'A',
      planningModel(),
      defaultModel(),
      true,
      undefined,
      undefined,
      5,
    );
    const promiseB = taskExecutorLocal.action(
      'B',
      planningModel(),
      defaultModel(),
      true,
      undefined,
      undefined,
      9,
    );

    // B completes (and tears down its batch) while A is still blocked.
    await promiseB;
    releaseA.resolve();
    await promiseA;

    const tapA = progress.filter((event) => event.name === 'TapA');
    const tapB = progress.filter((event) => event.name === 'TapB');

    // A's action_done survives B's teardown, and each call keeps its own limit.
    expect(tapA.map((event) => event.phase)).toEqual([
      'plan_action',
      'action_running',
      'action_done',
    ]);
    expect(tapA.every((event) => event.planLimit === 5)).toBe(true);
    expect(tapB.map((event) => event.phase)).toEqual([
      'plan_action',
      'action_running',
      'action_done',
    ]);
    expect(tapB.every((event) => event.planLimit === 9)).toBe(true);
  });

  it('emits semantic aiAct progress events from planning and action execution', async () => {
    const progressEvents: string[] = [];
    const progressScopes = new Set<string>();
    taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 3,
      actionSpace: emptyParamActionSpace,
      hooks: {
        // The executor is a pure producer: it publishes (scope, phase, data)
        // and the bus stamps the sequence. aiAct is just a scope; the
        // structured payload lives in `data`.
        onProgress: async (scope, phase, data) => {
          progressScopes.add(scope);
          const payload = (data ?? {}) as Record<string, any>;
          const semantic =
            payload.output ??
            payload.log ??
            payload.thought ??
            payload.error ??
            payload.prompt;
          progressEvents.push(
            [
              phase,
              payload.planIndex,
              payload.planLimit,
              semantic,
              payload.action?.name,
              payload.durationMs === undefined
                ? undefined
                : Math.round(payload.durationMs),
            ]
              .filter((item) => item !== undefined)
              .join('|'),
          );
        },
      },
    });

    vi.mocked(genericXmlPlan).mockResolvedValue({
      actions: [
        {
          type: 'Noop',
          param: {},
        },
      ],
      yamlFlow: [],
      shouldContinuePlanning: false,
      log: 'Need to run the noop action.',
      rawResponse: '',
      finalizeSuccess: true,
      finalizeMessage: 'Noop done.',
    });
    vi.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [
        {
          type: 'Action Space',
          subType: 'Noop',
          executor: async () => undefined,
        },
      ],
      yamlFlow: [],
    } as any);

    await taskExecutor.action(
      'run noop',
      planningModel(),
      defaultModel(),
      true,
    );

    expect(progressEvents).toEqual([
      'start|3|run noop',
      'plan_thinking|1|3',
      'plan_planned|1|3|Need to run the noop action.',
      'plan_action|1|3|Noop',
      'action_running|1|3|Noop',
      expect.stringMatching(/^action_done\|1\|3\|Noop\|\d+$/),
      'complete|1|3|Noop done.',
    ]);
    // Every event flows through the generic bus tagged with the aiAct scope.
    expect([...progressScopes]).toEqual(['aiAct']);
  });

  it('should use device-local formatted time for replanning feedback', async () => {
    const seenPendingFeedback: string[] = [];
    mockInterface.getDeviceLocalTimeString = vi
      .fn()
      .mockResolvedValue('2023-10-15 15:37:00 (YYYY-MM-DD HH:mm:ss)');
    taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: emptyParamActionSpace,
      useDeviceTime: true,
    });
    vi.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
      yamlFlow: [],
    } as any);

    vi.mocked(genericXmlPlan)
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [],
          yamlFlow: [],
          shouldContinuePlanning: true,
          log: 'first plan',
          rawResponse: '',
        };
      })
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [],
          yamlFlow: [],
          shouldContinuePlanning: false,
          log: '',
          rawResponse: '',
          finalizeSuccess: true,
          finalizeMessage: 'done',
        };
      });

    await taskExecutor.action('prompt', planningModel(), defaultModel(), true);

    expect(mockInterface.getDeviceLocalTimeString).toHaveBeenCalledWith(
      undefined,
    );
    expect(seenPendingFeedback).toEqual([
      '',
      'Current time: 2023-10-15 15:37:00 (YYYY-MM-DD HH:mm:ss)',
    ]);
  });

  it('should pass RunAdbShell planning feedback into the next planning request', async () => {
    const seenPendingFeedback: string[] = [];
    const planningFeedback = `RunAdbShell returned stdout. The stdout may indicate success or failure.
Command: settings get system screen_brightness
Stdout:
0`;

    vi.spyOn(taskExecutor, 'convertPlanToExecutable')
      .mockResolvedValueOnce({
        tasks: [
          {
            type: 'Action Space',
            subType: 'RunAdbShell',
            param: { command: 'settings get system screen_brightness' },
            executor: async (_param: unknown, context: ExecutorContext) => {
              context.task.planningFeedback = planningFeedback;
              return {
                output: '0',
              };
            },
          },
        ],
        yamlFlow: [],
      } as any)
      .mockResolvedValue({
        tasks: [],
        yamlFlow: [],
      } as any);

    vi.mocked(genericXmlPlan)
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [
            {
              type: 'RunAdbShell',
              param: { command: 'settings get system screen_brightness' },
              thought: 'read brightness state from adb shell',
            },
          ],
          yamlFlow: [],
          shouldContinuePlanning: true,
          log: 'first plan',
          rawResponse: '',
        };
      })
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [],
          yamlFlow: [],
          shouldContinuePlanning: false,
          log: '',
          rawResponse: '',
          finalizeSuccess: true,
          finalizeMessage: 'done',
        };
      });

    await taskExecutor.action(
      'check brightness with adb shell',
      planningModel(),
      defaultModel(),
      true,
    );

    expect(seenPendingFeedback[0]).toBe('');
    expect(seenPendingFeedback[1]).toContain(planningFeedback);
  });

  it('should truncate oversized planning feedback before the next planning request', async () => {
    const seenPendingFeedback: string[] = [];
    const longFeedback = 'x'.repeat(600);

    vi.spyOn(taskExecutor, 'convertPlanToExecutable')
      .mockResolvedValueOnce({
        tasks: [
          {
            type: 'Action Space',
            subType: 'RunAdbShell',
            param: { command: 'cat big-file' },
            executor: async (_param: unknown, context: ExecutorContext) => {
              context.task.planningFeedback = longFeedback;
              return {
                output: longFeedback,
              };
            },
          },
        ],
        yamlFlow: [],
      } as any)
      .mockResolvedValue({
        tasks: [],
        yamlFlow: [],
      } as any);

    vi.mocked(genericXmlPlan)
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [
            {
              type: 'RunAdbShell',
              param: { command: 'cat big-file' },
              thought: 'read a large file',
            },
          ],
          yamlFlow: [],
          shouldContinuePlanning: true,
          log: 'first plan',
          rawResponse: '',
        };
      })
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [],
          yamlFlow: [],
          shouldContinuePlanning: false,
          log: '',
          rawResponse: '',
          finalizeSuccess: true,
          finalizeMessage: 'done',
        };
      });

    await taskExecutor.action(
      'read big file with adb shell',
      planningModel(),
      defaultModel(),
      true,
    );

    expect(seenPendingFeedback[1]).toContain('x'.repeat(500));
    expect(seenPendingFeedback[1]).not.toContain('x'.repeat(600));
    expect(seenPendingFeedback[1]).toContain(
      '...[truncated, 100 more characters]',
    );
  });

  it('should collect all planning feedback instead of the final task output', async () => {
    const seenPendingFeedback: string[] = [];
    vi.setSystemTime(new Date(2023, 9, 15, 8, 30, 0));
    const firstPlanningFeedback = `RunAdbShell returned stdout. The stdout may indicate success or failure.
Command: settings get system screen_brightness
Stdout:
0`;
    const secondPlanningFeedback = `RunAdbShell returned stdout. The stdout may indicate success or failure.
Command: settings get system screen_off_timeout
Stdout:
30000`;
    const thirdPlanningFeedback = `RunAdbShell returned stdout. The stdout may indicate success or failure.
Command: dumpsys window
Stdout:
mCurrentFocus=Window{abc}`;
    const finalActionOutput = 'tap-output';

    vi.spyOn(taskExecutor, 'convertPlanToExecutable')
      .mockResolvedValueOnce({
        tasks: [
          {
            type: 'Action Space',
            subType: 'RunAdbShell',
            param: { command: 'settings get system screen_brightness' },
            executor: async (_param: unknown, context: ExecutorContext) => {
              context.task.planningFeedback = firstPlanningFeedback;
              return {
                output: '0',
              };
            },
          },
          {
            type: 'Action Space',
            subType: 'RunAdbShell',
            param: { command: 'settings get system screen_off_timeout' },
            executor: async (_param: unknown, context: ExecutorContext) => {
              context.task.planningFeedback = secondPlanningFeedback;
              return {
                output: '30000',
              };
            },
          },
          {
            type: 'Action Space',
            subType: 'RunAdbShell',
            param: { command: 'dumpsys window' },
            executor: async (_param: unknown, context: ExecutorContext) => {
              context.task.planningFeedback = thirdPlanningFeedback;
              return {
                output: 'mCurrentFocus=Window{abc}',
              };
            },
          },
          {
            type: 'Action Space',
            subType: 'Tap',
            param: { x: 10, y: 20 },
            executor: async () => ({
              output: finalActionOutput,
            }),
          },
        ],
        yamlFlow: [],
      } as any)
      .mockResolvedValue({
        tasks: [],
        yamlFlow: [],
      } as any);

    vi.mocked(genericXmlPlan)
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [
            {
              type: 'RunAdbShell',
              param: { command: 'settings get system screen_brightness' },
              thought: 'read brightness state from adb shell',
            },
            {
              type: 'RunAdbShell',
              param: { command: 'settings get system screen_off_timeout' },
              thought: 'read screen timeout state from adb shell',
            },
            {
              type: 'RunAdbShell',
              param: { command: 'dumpsys window' },
              thought: 'read current focus from adb shell',
            },
            {
              type: 'Tap',
              param: { x: 10, y: 20 },
              thought: 'tap after adb shell',
            },
          ],
          yamlFlow: [],
          shouldContinuePlanning: true,
          log: 'first plan',
          rawResponse: '',
        };
      })
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [],
          yamlFlow: [],
          shouldContinuePlanning: false,
          log: '',
          rawResponse: '',
          finalizeSuccess: true,
          finalizeMessage: 'done',
        };
      });

    await taskExecutor.action(
      'check brightness',
      planningModel(),
      defaultModel(),
      true,
    );

    expect(
      seenPendingFeedback[1],
    ).toBe(`Time: 2023-10-15 08:30:00 (YYYY-MM-DD HH:mm:ss), ${firstPlanningFeedback}

${secondPlanningFeedback}

${thirdPlanningFeedback}`);
    expect(seenPendingFeedback[1]).not.toContain(finalActionOutput);
  });

  it('should not pass empty planning feedback into the next planning request', async () => {
    const seenPendingFeedback: string[] = [];
    taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: [],
    });
    vi.spyOn(taskExecutor, 'convertPlanToExecutable')
      .mockResolvedValueOnce({
        tasks: [
          {
            type: 'Action Space',
            subType: 'WriteState',
            param: { key: 'clipboard' },
            executor: async (_param: unknown, context: ExecutorContext) => {
              context.task.planningFeedback = '';
              return {
                output: '',
              };
            },
          },
        ],
        yamlFlow: [],
      } as any)
      .mockResolvedValue({
        tasks: [],
        yamlFlow: [],
      } as any);

    vi.mocked(genericXmlPlan)
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [
            {
              type: 'WriteState',
              param: { key: 'clipboard' },
              thought: 'write state',
            },
          ],
          yamlFlow: [],
          shouldContinuePlanning: true,
          log: 'first plan',
          rawResponse: '',
        };
      })
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [],
          yamlFlow: [],
          shouldContinuePlanning: false,
          log: '',
          rawResponse: '',
          finalizeSuccess: true,
          finalizeMessage: 'done',
        };
      });

    await taskExecutor.action(
      'copy clipboard',
      planningModel(),
      defaultModel(),
      true,
    );

    expect(seenPendingFeedback[1]).not.toContain('WriteState');
  });

  it('should fall back to runtime time instead of device timestamp when device-local time is unavailable', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2023, 9, 15, 8, 30, 0));

    const seenPendingFeedback: string[] = [];
    taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: emptyParamActionSpace,
      useDeviceTime: true,
    });
    vi.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
      yamlFlow: [],
    } as any);

    vi.mocked(genericXmlPlan)
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [],
          yamlFlow: [],
          shouldContinuePlanning: true,
          log: 'first plan',
          rawResponse: '',
        };
      })
      .mockImplementationOnce(async (_instruction, opts: any) => {
        seenPendingFeedback.push(
          opts.conversationHistory.pendingFeedbackMessage,
        );
        opts.conversationHistory.resetPendingFeedbackMessageIfExists();
        return {
          actions: [],
          yamlFlow: [],
          shouldContinuePlanning: false,
          log: '',
          rawResponse: '',
          finalizeSuccess: true,
          finalizeMessage: 'done',
        };
      });

    await taskExecutor.action('prompt', planningModel(), defaultModel(), true);

    expect(seenPendingFeedback).toEqual([
      '',
      'Current time: 2023-10-15 08:30:00 (YYYY-MM-DD HH:mm:ss)',
    ]);
  });

  it('disables aiAct deepLocate for custom planning adapters by default', async () => {
    const actionSpace: DeviceAction[] = [
      {
        name: 'Tap',
        description: 'tap',
        paramSchema: z.object({
          locate: getMidsceneLocationSchema(),
        }),
        call: async () => undefined,
      },
    ];
    mockInterface.actionSpace = vi.fn().mockReturnValue(actionSpace);
    taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace,
    });
    vi.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
      yamlFlow: [],
    } as any);

    const planFn = vi.fn().mockResolvedValue({
      actions: [
        {
          type: 'Tap',
          param: {
            locate: {
              prompt: 'button',
              deepLocate: true,
              locatedPixelBbox: [10, 20, 30, 40],
            },
          },
        },
      ],
      yamlFlow: [],
      shouldContinuePlanning: false,
      log: '',
      rawResponse: '',
    });
    const customPlanningModel: ModelRuntime = {
      config: {
        modelName: 'custom-planning-model',
        modelDescription: 'custom-planning-model',
        intent: 'planning',
        slot: 'planning',
      },
      adapter: new ResolvedModelAdapter(
        {
          planning: {
            kind: 'custom',
            planFn,
          },
        },
        'test-custom-planning',
      ),
    };
    const convertSpy = vi.mocked(taskExecutor.convertPlanToExecutable);
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await taskExecutor.action(
      'prompt',
      customPlanningModel,
      defaultModel(),
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(convertSpy).toHaveBeenCalledWith(
      expect.any(Array),
      customPlanningModel,
      expect.anything(),
      expect.objectContaining({
        deepLocate: false,
      }),
    );
    expect(convertSpy.mock.calls[0][0][0].param.locate.deepLocate).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      '[Midscene]',
      'The "deepLocate" option is not supported for aiAct with the current planning adapter (modelFamily: unknown). It will be ignored.',
    );
  });
});
