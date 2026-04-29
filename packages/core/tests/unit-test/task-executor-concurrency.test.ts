import { TaskExecutor } from '@/agent/tasks';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Service from '../../src';

vi.mock('@/ai-model/llm-planning', () => ({
  plan: vi.fn(),
}));

import { plan } from '@/ai-model/llm-planning';

const validBase64Image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
};

describe('TaskExecutor concurrency isolation', () => {
  let taskExecutor: TaskExecutor;
  let mockInterface: AbstractInterface;
  let mockService: Service;

  beforeEach(() => {
    mockInterface = {
      interfaceType: 'web',
      actionSpace: vi.fn().mockReturnValue([]),
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
      actionSpace: [],
    });

    vi.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
      yamlFlow: [],
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should isolate conversation history between concurrent action calls', async () => {
    const waitForBothCalls = createDeferred();
    const releasePlans = createDeferred();

    const seenHistories: any[] = [];

    vi.mocked(plan).mockImplementation(async (_instruction, opts: any) => {
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
    });

    const actionPromiseA = taskExecutor.action(
      'first prompt',
      { modelName: 'planning-model' } as any,
      { modelName: 'default-model' } as any,
      true,
    );
    const actionPromiseB = taskExecutor.action(
      'second prompt',
      { modelName: 'planning-model' } as any,
      { modelName: 'default-model' } as any,
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
      actionSpace: [],
      useDeviceTimestamp: true,
    });
    vi.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
      yamlFlow: [],
    } as any);

    vi.mocked(plan)
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

    await taskExecutor.action(
      'prompt',
      { modelName: 'planning-model' } as any,
      { modelName: 'default-model' } as any,
      true,
    );

    expect(mockInterface.getDeviceLocalTimeString).toHaveBeenCalledWith(
      undefined,
    );
    expect(seenPendingFeedback).toEqual([
      '',
      'Current time: 2023-10-15 15:37:00 (YYYY-MM-DD HH:mm:ss)',
    ]);
  });
});
