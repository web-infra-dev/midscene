import { TaskExecutor } from '@/agent/tasks';
import { getMidsceneLocationSchema } from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import type { ModelRuntime } from '@/ai-model/models/types';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { DeviceAction } from '@/types';
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

  it('should pass RunAdbShell stdout into the next planning feedback', async () => {
    const seenPendingFeedback: string[] = [];
    const command = 'settings get system screen_brightness';
    const stdout = '0\n';

    vi.spyOn(taskExecutor, 'convertPlanToExecutable')
      .mockResolvedValueOnce({
        tasks: [
          {
            type: 'Action Space',
            subType: 'RunAdbShell',
            param: { command },
            executor: async () => ({
              output: stdout,
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
              param: { command },
              thought: 'read brightness setting',
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

    expect(seenPendingFeedback[0]).toBe('');
    expect(seenPendingFeedback[1]).toContain('RunAdbShell returned stdout');
    expect(seenPendingFeedback[1]).toContain(
      'The stdout may indicate success or failure',
    );
    expect(seenPendingFeedback[1]).toContain(`Command: ${command}`);
    expect(seenPendingFeedback[1]).toContain(`Stdout:\n${stdout}`);
  });

  it('should collect all RunAdbShell stdout instead of the final task output', async () => {
    const seenPendingFeedback: string[] = [];
    const command = 'settings get system screen_brightness';
    const secondCommand = 'settings get system screen_off_timeout';
    const stdout = '0\n';
    const secondStdout = '30000\n';
    const finalActionOutput = 'tap-output';

    vi.spyOn(taskExecutor, 'convertPlanToExecutable')
      .mockResolvedValueOnce({
        tasks: [
          {
            type: 'Action Space',
            subType: 'RunAdbShell',
            param: { command },
            executor: async () => ({
              output: stdout,
            }),
          },
          {
            type: 'Action Space',
            subType: 'RunAdbShell',
            param: { command: secondCommand },
            executor: async () => ({
              output: secondStdout,
            }),
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
              param: { command },
              thought: 'read brightness setting',
            },
            {
              type: 'RunAdbShell',
              param: { command: secondCommand },
              thought: 'read screen timeout setting',
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

    expect(seenPendingFeedback[1]).toContain('RunAdbShell returned stdout');
    expect(seenPendingFeedback[1]).toContain(`Command: ${command}`);
    expect(seenPendingFeedback[1]).toContain(`Stdout:\n${stdout}`);
    expect(seenPendingFeedback[1]).toContain(`Command: ${secondCommand}`);
    expect(seenPendingFeedback[1]).toContain(`Stdout:\n${secondStdout}`);
    expect(seenPendingFeedback[1]).not.toContain(finalActionOutput);
  });

  it('should not pass empty RunAdbShell stdout into the next planning feedback', async () => {
    const seenPendingFeedback: string[] = [];
    const command = 'cmd clipboard set-text "Tracking #: 5K672F4C"';
    taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: [],
    });
    vi.spyOn(taskExecutor, 'convertPlanToExecutable')
      .mockResolvedValueOnce({
        tasks: [
          {
            type: 'Action Space',
            subType: 'RunAdbShell',
            param: { command },
            executor: async () => ({
              output: '',
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
              param: { command },
              thought: 'set clipboard',
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

    expect(seenPendingFeedback[1]).not.toContain('RunAdbShell returned stdout');
    expect(seenPendingFeedback[1]).not.toContain(`Command: ${command}`);
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
