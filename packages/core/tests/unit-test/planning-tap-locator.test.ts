import { AIResponseParseError } from '@/ai-model/service-caller';
import { resolvePlanningTapLocator } from '@/ai-model/workflows/inspect/planning-action-locate';
import { runCustomPlanning } from '@/ai-model/workflows/planning/custom-planning';
import type { ResolvedCustomPlanningDefinition } from '@/ai-model/workflows/planning/custom-planning-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/workflows/planning/custom-planning', () => ({
  runCustomPlanning: vi.fn(),
}));

function createPlanner(): ResolvedCustomPlanningDefinition<null> {
  return {
    messages: {
      systemPromptPlacement: 'system-message',
      buildSystemPrompt: () => 'planning system prompt',
    },
    coordinateSystem: {
      shape: 'point',
      order: 'xy',
      normalizedBy: 1000,
    },
    coordinateNormalizer: {} as any,
    parseResponse: () => null,
    transformActions: () => [],
    shouldContinuePlanning: () => false,
    buildResponseLog: () => '',
  };
}

function createLocateRequest() {
  const options = {
    context: {
      screenshot: {
        base64: 'data:image/png;base64,SCREENSHOT==',
        capturedAt: 123,
      },
      shotSize: {
        width: 1000,
        height: 800,
      },
      shrunkShotToLogicalRatio: 1,
    },
    actionSpace: [],
    conversationHistory: {} as any,
    includeLocateInPlanning: false,
    modelRuntime: {
      adapter: {
        imagePreprocess: {},
      },
      config: {
        modelName: 'test-model',
        modelDescription: 'test-model',
        slot: 'default',
      },
    },
  } as any;

  return {
    elementDescriptionText: 'submit button',
    locateImage: {
      imageBase64: 'data:image/png;base64,CROP==',
      width: 320,
      height: 240,
    },
    referenceImageMessages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'reference image',
          },
        ],
      },
    ],
    options,
  } as any;
}

describe('resolvePlanningTapLocator', () => {
  beforeEach(() => {
    vi.mocked(runCustomPlanning).mockReset();
  });

  it('runs the resolved planner once with tap locate options and returns the configured bbox', async () => {
    const actions = [{ type: 'Tap', param: {} }];
    vi.mocked(runCustomPlanning).mockResolvedValueOnce({
      actions,
      shouldContinuePlanning: false,
      rawResponse: 'raw planning response',
      rawChoiceMessage: { role: 'assistant' },
      usage: { total_tokens: 3 } as any,
      log: 'planner reasoning',
    });

    const getLocatedPixelBbox = vi.fn((): [number, number, number, number] => [
      1, 2, 3, 4,
    ]);
    const locate = resolvePlanningTapLocator(
      {
        buildSystemPrompt: () => 'locate system prompt',
        getLocatedPixelBbox,
      },
      createPlanner(),
    );

    const result = await locate(
      'submit button',
      createLocateRequest().options,
      createLocateRequest(),
    );

    const [, planOptions, locatorPlanner] =
      vi.mocked(runCustomPlanning).mock.calls[0];
    expect(planOptions.context.screenshot.base64).toBe(
      'data:image/png;base64,CROP==',
    );
    expect(planOptions.context.shotSize).toEqual({ width: 320, height: 240 });
    expect(planOptions.includeLocateInPlanning).toBe(true);
    expect(planOptions.actionSpace.map((action: any) => action.name)).toEqual([
      'Tap',
    ]);
    expect(planOptions.referenceImageMessages).toEqual(
      createLocateRequest().referenceImageMessages,
    );
    expect(locatorPlanner.messages.buildSystemPrompt()).toBe(
      'locate system prompt',
    );
    expect(
      locatorPlanner.messages.buildUserInstruction?.('submit button'),
    ).toBe('Tap: submit button');
    expect(getLocatedPixelBbox).toHaveBeenCalledWith(actions);
    expect(result).toEqual({
      locatedPixelBbox: [1, 2, 3, 4],
      rawResponse: 'raw planning response',
      rawChoiceMessage: { role: 'assistant' },
      usage: { total_tokens: 3 },
      reasoningContent: 'planner reasoning',
    });
  });

  it('returns an error when the planner actions do not contain a tap bbox', async () => {
    vi.mocked(runCustomPlanning).mockResolvedValueOnce({
      actions: [{ type: 'Scroll', param: {} }],
      shouldContinuePlanning: false,
      rawResponse: 'raw planning response',
      log: 'planner reasoning',
    });

    const locate = resolvePlanningTapLocator(
      {
        buildSystemPrompt: () => 'locate system prompt',
        getLocatedPixelBbox: () => undefined,
      },
      createPlanner(),
    );

    const result = await locate(
      'submit button',
      createLocateRequest().options,
      createLocateRequest(),
    );

    expect(result).toEqual({
      rawResponse: 'raw planning response',
      rawChoiceMessage: undefined,
      usage: undefined,
      reasoningContent: 'planner reasoning',
      errors: ['No locatedPixelBbox found in planner response'],
    });
  });

  it('preserves raw response metadata from planner parse errors', async () => {
    const rawChoiceMessage = { role: 'assistant', content: 'bad response' };
    const usage = { total_tokens: 5 } as any;
    vi.mocked(runCustomPlanning).mockRejectedValueOnce(
      new AIResponseParseError(
        'Parse error: malformed response',
        'raw malformed response',
        usage,
        rawChoiceMessage,
      ),
    );

    const locate = resolvePlanningTapLocator(
      {
        buildSystemPrompt: () => 'locate system prompt',
        getLocatedPixelBbox: () => undefined,
      },
      createPlanner(),
    );

    const result = await locate(
      'submit button',
      createLocateRequest().options,
      createLocateRequest(),
    );

    expect(result).toEqual({
      rawResponse: 'raw malformed response',
      rawChoiceMessage,
      usage,
      reasoningContent: '',
      errors: ['Parse error: malformed response'],
    });
  });
});
