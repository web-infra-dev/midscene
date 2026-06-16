import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceCallerMock = vi.hoisted(() => {
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
    callAIWithStringResponse: vi.fn(),
  };
});

vi.mock('@/ai-model/service-caller/index', () => {
  return serviceCallerMock;
});

vi.mock('../../src/ai-model/service-caller/index', () => {
  return serviceCallerMock;
});

import { TaskExecutor } from '@/agent/tasks';
import { getMidsceneLocationSchema } from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import type { ModelRuntime } from '@/ai-model/models/types';
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
      actionSpace: vi.fn(),
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes aiAct deepLocate through custom planning adapters', async () => {
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

    const plannedActions = [
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
    ];
    const customPlanningModel = createCustomPlanningModel(plannedActions);
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({ content: '' });
    const convertSpy = vi.mocked(taskExecutor.convertPlanToExecutable);
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
  });

  it('warns that deepThink is not supported by custom planning adapters', async () => {
    taskExecutor = new TaskExecutor(mockInterface, mockService, {
      replanningCycleLimit: 1,
      actionSpace: [],
    });
    vi.spyOn(taskExecutor, 'convertPlanToExecutable').mockResolvedValue({
      tasks: [],
      yamlFlow: [],
    } as any);
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({ content: '' });
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await taskExecutor.action(
      'prompt',
      createCustomPlanningModel(),
      defaultModel(),
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[Midscene]',
      'The "deepThink" option is not supported for aiAct with custom planning adapters (modelFamily: unknown). It will be ignored by the planner.',
    );
  });
});
