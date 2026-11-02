import { definePlannedWait } from '@/agent/planned-wait';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

const serviceCallerMock = rs.hoisted(() => {
  class AIResponseParseError extends Error {
    rawResponse?: string;
    usage?: unknown;
    rawAssistantOutput?: unknown;

    constructor(
      message: string,
      rawResponse?: string,
      usage?: unknown,
      rawAssistantOutput?: unknown,
    ) {
      super(message);
      this.name = 'AIResponseParseError';
      this.rawResponse = rawResponse;
      this.usage = usage;
      this.rawAssistantOutput = rawAssistantOutput;
    }
  }

  return {
    AIResponseParseError,
    callAIWithStringResponse: rs.fn(),
  };
});

rs.mock('@/ai-model/service-caller/index', () => {
  return serviceCallerMock;
});

rs.mock('../../src/ai-model/service-caller/index', () => {
  return serviceCallerMock;
});

import * as freshness from '@/agent/plan-freshness';
import { TaskExecutor } from '@/agent/tasks';
import { getMidsceneLocationSchema } from '@/ai-model';
import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import type { ModelRuntime } from '@/ai-model/model-adapter/types';
import { getModelRuntime } from '@/ai-model/models';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import type { AbstractInterface } from '@/device';
import { ScreenshotItem } from '@/screenshot-item';
import type { DeviceAction } from '@/types';
import { z } from 'zod';
import type Service from '../../src';

const validBase64Image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const defaultModel = () =>
  getModelRuntime({
    modelName: 'default-model',
    modelDescription: 'default-model',
    intent: 'default',
    slot: 'default',
  });

function createCustomPlanningModel(
  plannedActions: any[] = [],
  shouldContinuePlanning = () => false,
): ModelRuntime {
  return {
    config: {
      modelName: 'custom-planning-model',
      modelDescription: 'custom-planning-model',
      intent: 'default',
      slot: 'default',
    },
    adapter: new ResolvedModelAdapter(
      {
        planning: {
          kind: 'custom',
          planner: {
            messages: {
              systemPromptPlacement: 'system-message',
              buildSystemPrompt: () => '',
            },
            coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
            parseResponse: () => null,
            transformActions: () => structuredClone(plannedActions),
            shouldContinuePlanning,
            buildResponseLog: () => '',
          },
        },
      },
      'test-custom-planning',
    ),
  };
}

describe('TaskExecutor custom planning adapters', () => {
  let taskExecutor: TaskExecutor;
  let mockInterface: AbstractInterface;
  let mockService: Service;

  beforeEach(() => {
    mockInterface = {
      interfaceType: 'web',
      actionSpace: rs.fn(),
    } as unknown as AbstractInterface;

    mockService = {
      contextRetrieverFn: rs.fn().mockResolvedValue({
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
  });

  afterEach(() => {
    rs.restoreAllMocks();
  });

  it('stops the action batch and does not replan after a conditional wait fails', async () => {
    const nextAction = rs.fn(async () => {});
    const actionSpace = [
      definePlannedWait(async () => {
        throw new Error('deadline');
      }),
      {
        name: 'Submit',
        description: 'submit',
        paramSchema: z.object({}),
        call: nextAction,
      },
    ];
    const executor = new TaskExecutor(mockInterface, mockService, {
      getDefaultModelRuntime: defaultModel,
      actionSpace,
      replanningCycleLimit: 3,
    });
    const planning = createCustomPlanningModel([
      { type: 'WaitFor', param: { condition: 'ready' } },
      { type: 'Submit', param: {} },
    ]);
    rs.mocked(callAIWithStringResponse).mockResolvedValue({ content: '' });
    await expect(
      executor.action('send once', planning, defaultModel()),
    ).rejects.toThrow('Planned WaitFor failed');
    expect(nextAction).not.toHaveBeenCalled();
    expect(callAIWithStringResponse).toHaveBeenCalledTimes(1);
  });
  it('replans after successful waiting instead of executing coordinates from before the wait', async () => {
    const oldAction = rs.fn(async () => {});
    const actionSpace = [
      definePlannedWait(async () => {}),
      {
        name: 'Submit',
        description: 'submit',
        paramSchema: z.object({}),
        call: oldAction,
      },
    ];
    const executor = new TaskExecutor(mockInterface, mockService, {
      getDefaultModelRuntime: defaultModel,
      actionSpace,
      planningWaitFor: true,
      replanningCycleLimit: 1,
    });
    const planning = createCustomPlanningModel([
      { type: 'WaitFor', param: { condition: 'ready' } },
      { type: 'Submit', param: {} },
    ]);
    rs.mocked(callAIWithStringResponse).mockResolvedValue({ content: '' });
    await expect(
      executor.action('send once', planning, defaultModel()),
    ).rejects.toThrow();
    expect(oldAction).not.toHaveBeenCalled();
  });

  it('requests prompt-only planning when a separate Locate model is configured', async () => {
    const actionSpace: DeviceAction[] = [
      {
        name: 'Tap',
        description: 'tap',
        paramSchema: z.object({ locate: getMidsceneLocationSchema() }),
        call: async () => undefined,
      },
    ];
    mockInterface.actionSpace = rs.fn().mockReturnValue(actionSpace);
    const executor = new TaskExecutor(mockInterface, mockService, {
      getDefaultModelRuntime: defaultModel,
      replanningCycleLimit: 1,
      actionSpace,
    });
    const convert = rs
      .spyOn(executor, 'convertPlanToExecutable')
      .mockResolvedValue({ tasks: [], yamlFlow: [] } as any);
    const planning = createCustomPlanningModel([
      {
        type: 'Tap',
        param: { locate: { prompt: 'button', point: [500, 500] } },
      },
    ]);
    const locate = getModelRuntime({
      ...defaultModel().config,
      intent: 'locate',
      slot: 'locate',
      modelName: 'locator',
    });
    rs.mocked(callAIWithStringResponse).mockResolvedValueOnce({ content: '' });
    await executor.action('prompt', planning, locate);
    expect(convert.mock.calls[0][0][0].param.locate).toEqual({
      prompt: 'button',
    });
    expect(convert.mock.calls[0][2].config).toBe(locate.config);
  });

  it('passes normalized deepLocate through custom planning adapters', async () => {
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
    mockInterface.actionSpace = rs.fn().mockReturnValue(actionSpace);
    taskExecutor = new TaskExecutor(mockInterface, mockService, {
      getDefaultModelRuntime: defaultModel,
      replanningCycleLimit: 1,
      actionSpace,
    });
    rs.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
      yamlFlow: [],
    } as any);

    const plannedActions = [
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'button',
            deepLocate: true,
            point: [500, 500],
          },
        },
      },
    ];
    const customPlanningModel = createCustomPlanningModel(plannedActions);
    rs.mocked(callAIWithStringResponse).mockResolvedValueOnce({ content: '' });
    const convertSpy = rs.mocked(taskExecutor.convertPlanToExecutable);
    await taskExecutor.action(
      'prompt',
      customPlanningModel,
      defaultModel(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(convertSpy).toHaveBeenCalledWith(
      expect.any(Array),
      // modelRuntime objects may carry extra CI-injected fields (e.g. an
      // execution id) when running the full suite, so match on its core shape.
      expect.objectContaining({
        config: customPlanningModel.config,
        adapter: customPlanningModel.adapter,
      }),
      expect.anything(),
      expect.objectContaining({
        deepLocate: true,
      }),
    );
    expect(convertSpy.mock.calls[0][0][0].param.locate.deepLocate).toBe(true);
    expect(
      convertSpy.mock.calls[0][0][0].param.locate.locatedPixelResult.center,
    ).toHaveLength(2);
  });
  it('discards a stale plan and executes only the fresh replacement', async () => {
    const actionSpace: DeviceAction[] = [
      {
        name: 'Tap',
        description: 'tap',
        paramSchema: z.object({ locate: getMidsceneLocationSchema() }),
        call: async () => undefined,
      },
    ];
    const executor = new TaskExecutor(mockInterface, mockService, {
      getDefaultModelRuntime: defaultModel,
      replanningCycleLimit: 2,
      actionSpace,
    });
    const convert = rs
      .spyOn(executor, 'convertPlanToExecutable')
      .mockResolvedValue({ tasks: [] });
    const guard = rs
      .spyOn(freshness, 'evaluatePlanFreshness')
      .mockResolvedValueOnce({
        changed: true,
        changedPixels: 100,
        dimensionsChanged: false,
      })
      .mockResolvedValueOnce({
        changed: false,
        changedPixels: 0,
        dimensionsChanged: false,
      });
    rs.mocked(callAIWithStringResponse).mockResolvedValue({ content: '' });
    await executor.action(
      'open the target',
      createCustomPlanningModel([
        {
          type: 'Tap',
          param: { locate: { prompt: 'target', point: [500, 500] } },
        },
      ]),
      defaultModel(),
      undefined,
      false,
      undefined,
      'balance',
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );
    expect(guard).toHaveBeenCalledTimes(2);
    expect(convert).toHaveBeenCalledTimes(1);
    const calls = rs.mocked(callAIWithStringResponse).mock.calls;
    expect(JSON.stringify(calls[1][0])).toContain(
      'The planned action was NOT executed',
    );
    expect(JSON.stringify(calls[1][0])).not.toContain(
      'The previous action has been executed',
    );
  });

  it('stops at the planning limit without ever executing a continuously stale plan', async () => {
    const actionSpace: DeviceAction[] = [
      {
        name: 'Tap',
        description: 'tap',
        paramSchema: z.object({ locate: getMidsceneLocationSchema() }),
        call: async () => undefined,
      },
    ];
    const executor = new TaskExecutor(mockInterface, mockService, {
      getDefaultModelRuntime: defaultModel,
      replanningCycleLimit: 1,
      actionSpace,
    });
    const convert = rs
      .spyOn(executor, 'convertPlanToExecutable')
      .mockResolvedValue({ tasks: [] });
    rs.spyOn(freshness, 'evaluatePlanFreshness').mockResolvedValue({
      changed: true,
      changedPixels: 100,
      dimensionsChanged: false,
    });
    rs.mocked(callAIWithStringResponse).mockResolvedValue({ content: '' });
    await expect(
      executor.action(
        'open the target',
        createCustomPlanningModel([
          {
            type: 'Tap',
            param: { locate: { prompt: 'target', point: [500, 500] } },
          },
        ]),
        defaultModel(),
        undefined,
        false,
        undefined,
        'balance',
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      ),
    ).rejects.toThrow('planning cycle limit');
    expect(convert).not.toHaveBeenCalled();
  });
  it.each([
    { changes: [true, true, true], executions: 0, fails: true },
    { changes: [true, true, false], executions: 1, fails: false },
    {
      changes: [true, true, false, true, true, false],
      executions: 2,
      fails: false,
    },
    { changes: [false, false, false, false], executions: 4, fails: false },
    {
      changes: [true, true, false, true],
      executions: 1,
      fails: true,
      actionFails: true,
    },
  ])(
    'bounds consecutive screen-change replans: $changes',
    async ({ changes, executions, fails, actionFails }) => {
      const executor = new TaskExecutor(mockInterface, mockService, {
        getDefaultModelRuntime: defaultModel,
        replanningCycleLimit: 20,
        actionSpace: [],
      });
      const execute = rs.fn(async () => {
        if (actionFails) throw new Error('tap failed');
      });
      rs.spyOn(executor, 'convertPlanToExecutable').mockResolvedValue({
        tasks: [{ type: 'Action Space', subType: 'Tap', executor: execute }],
      });
      let round = 0;
      const guard = rs
        .spyOn(freshness, 'evaluatePlanFreshness')
        .mockImplementation(async () => {
          const changed = changes[round++];
          return {
            changed,
            changedPixels: changed ? 100 : 0,
            dimensionsChanged: false,
          };
        });
      rs.mocked(callAIWithStringResponse).mockResolvedValue({ content: '' });
      const result = executor.action(
        'open target',
        createCustomPlanningModel([], () => round < changes.length - 1),
        defaultModel(),
        undefined,
        false,
        undefined,
        'balance',
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      );
      if (fails) {
        await expect(result).rejects.toThrow(
          'after 2 consecutive screen-change replans',
        );
      } else {
        await result;
      }
      expect(guard).toHaveBeenCalledTimes(changes.length);
      expect(execute).toHaveBeenCalledTimes(executions);
    },
  );

  it('records a failed plan if screen comparison fails, without executing actions', async () => {
    const executor = new TaskExecutor(mockInterface, mockService, {
      getDefaultModelRuntime: defaultModel,
      replanningCycleLimit: 2,
      actionSpace: [],
    });
    const convert = rs.spyOn(executor, 'convertPlanToExecutable');
    rs.spyOn(freshness, 'evaluatePlanFreshness').mockRejectedValue(
      new Error('invalid screenshot'),
    );
    rs.mocked(callAIWithStringResponse).mockResolvedValue({ content: '' });
    await expect(
      executor.action(
        'open target',
        createCustomPlanningModel(),
        defaultModel(),
        undefined,
        false,
        undefined,
        'balance',
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      ),
    ).rejects.toThrow('Failed to check screen freshness: invalid screenshot');
    expect(convert).not.toHaveBeenCalled();
  });

  it('does not compare screens by default', async () => {
    const executor = new TaskExecutor(mockInterface, mockService, {
      getDefaultModelRuntime: defaultModel,
      replanningCycleLimit: 2,
      actionSpace: [],
    });
    const guard = rs.spyOn(freshness, 'evaluatePlanFreshness');
    rs.spyOn(executor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
    });
    rs.mocked(callAIWithStringResponse).mockResolvedValue({ content: '' });
    await executor.action(
      'open target',
      createCustomPlanningModel(),
      defaultModel(),
    );
    expect(guard).not.toHaveBeenCalled();
  });
});
