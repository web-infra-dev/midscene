import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

const serviceCallerMock = rs.hoisted(() => {
  class AIResponseParseError extends Error {
    rawResponse?: string;
    usage?: unknown;
    rawChoiceMessage?: unknown;

    constructor(
      message: string,
      rawResponse?: string,
      usage?: unknown,
      rawChoiceMessage?: unknown,
    ) {
      super(message);
      this.name = 'AIResponseParseError';
      this.rawResponse = rawResponse;
      this.usage = usage;
      this.rawChoiceMessage = rawChoiceMessage;
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

function createCustomPlanningModel(plannedActions: any[] = []): ModelRuntime {
  return {
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
          planner: {
            messages: {
              systemPromptPlacement: 'system-message',
              buildSystemPrompt: () => '',
            },
            coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
            parseResponse: () => null,
            transformActions: () => plannedActions,
            shouldContinuePlanning: () => false,
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
        deepLocate: true,
      }),
    );
    expect(convertSpy.mock.calls[0][0][0].param.locate.deepLocate).toBe(true);
    expect(
      convertSpy.mock.calls[0][0][0].param.locate.locatedPixelBbox,
    ).toHaveLength(4);
  });
});
