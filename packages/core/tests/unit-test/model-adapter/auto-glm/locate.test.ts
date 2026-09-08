import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { autoGlmAdapters } from '@/ai-model/models/auto-glm/adapter';
import { createAutoGlmPlanningTapLocator } from '@/ai-model/models/auto-glm/locate';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import { AiLocateElement } from '@/ai-model/workflows/grounding';
import type { LocateOptions } from '@/ai-model/workflows/grounding/types';
import type { UIContext } from '@/types';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

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

rs.mock('../../../../src/ai-model/service-caller/index', () => {
  return serviceCallerMock;
});

const autoGlmAdapter = new ResolvedModelAdapter(
  autoGlmAdapters['auto-glm'],
  'auto-glm',
);

const context: UIContext = {
  screenshot: {
    base64: 'data:image/png;base64,AA==',
  } as any,
  shotSize: {
    width: 1000,
    height: 800,
  },
  shrunkShotToLogicalRatio: 1,
};

describe('Auto-GLM planning tap locator definition', () => {
  it('selects locate prompt by language mode', () => {
    expect(
      createAutoGlmPlanningTapLocator(false).buildSystemPrompt(),
    ).toContain('你的目标是定位并点击用户指定的UI元素');
    expect(createAutoGlmPlanningTapLocator(true).buildSystemPrompt()).toContain(
      'Your goal is to locate and tap the UI element specified by the user',
    );
  });

  it('extracts the complete pixel result from the first Tap action only', () => {
    const locator = createAutoGlmPlanningTapLocator(false);

    expect(
      locator.getLocatedPixelResult([
        { type: 'Scroll', param: {} },
        {
          type: 'Tap',
          param: {
            locate: {
              locatedPixelResult: {
                center: [20, 30],
                rect: { left: 10, top: 20, width: 21, height: 21 },
              },
            },
          },
        },
      ] as any),
    ).toEqual({
      center: [20, 30],
      rect: { left: 10, top: 20, width: 21, height: 21 },
    });
    expect(
      locator.getLocatedPixelResult([{ type: 'Scroll', param: {} }] as any),
    ).toBeUndefined();
  });
});

function createLocateOptions(): LocateOptions {
  return {
    context,
    modelRuntime: {
      config: {
        modelName: 'auto-glm-test-model',
        modelFamily: 'auto-glm',
        modelDescription: 'auto-glm-test-model',
        intent: 'default',
        slot: 'default',
      },
      adapter: autoGlmAdapter,
    } as any,
  };
}

describe('Auto-GLM custom locate', () => {
  beforeEach(() => {
    rs.mocked(callAIWithStringResponse).mockReset();
  });

  it('runs Auto-GLM custom locate and maps normalized coordinates to a point', async () => {
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    if (autoGlmAdapter.locate.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom locate adapter');
    }
    rs.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content:
        '<think>Found submit</think><answer>do(action="Tap", element=[500,500])</answer>',
      usage: { total_tokens: 8 } as any,
    });

    const result = await AiLocateElement({
      ...createLocateOptions(),
      targetElementDescription: 'submit button',
    });

    expect(callAIWithStringResponse).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: 'Tap: submit button',
            }),
          ]),
        }),
      ]),
      expect.any(Object),
      expect.any(Object),
    );
    expect(result.parseResult.element?.center).toEqual([500, 400]);
    expect(result.parseResult.errors).toEqual([]);
    expect(result.parseResult.element).not.toHaveProperty('rect');
    expect(result.reasoning_content).toContain('Found submit');
    expect(result.usage).toEqual({ total_tokens: 8 });
  });

  it('uses search area image size for planning and maps the point back to the original screenshot', async () => {
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    if (autoGlmAdapter.locate.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom locate adapter');
    }
    rs.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content:
        '<think>Found item in crop</think><answer>do(action="Tap", element=[500,500])</answer>',
    });

    const result = await AiLocateElement({
      ...createLocateOptions(),
      targetElementDescription: 'item',
      searchConfig: {
        sourceRect: {
          left: 200,
          top: 100,
          width: 300,
          height: 200,
        },
        image: {
          imageBase64: 'data:image/png;base64,CROP==',
          width: 300,
          height: 200,
        },
        mapping: {
          offset: {
            x: 200,
            y: 100,
          },
          scale: 1,
        },
      },
    });

    const messages = rs.mocked(callAIWithStringResponse).mock.calls[0]?.[0];
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'image_url',
              image_url: expect.objectContaining({
                url: 'data:image/png;base64,CROP==',
              }),
            }),
          ]),
        }),
      ]),
    );
    expect(result.parseResult.element?.center).toEqual([350, 200]);
  });

  it('returns parse errors from Auto-GLM custom locate responses', async () => {
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    if (autoGlmAdapter.locate.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom locate adapter');
    }
    rs.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'do(action="Swipe", start=[100,200], end=[300,400])',
    });

    const result = await AiLocateElement({
      ...createLocateOptions(),
      targetElementDescription: 'submit button',
    });

    expect(result).not.toHaveProperty('rect');
    expect(result.parseResult.element).toBeUndefined();
    expect(result.parseResult.errors).toEqual([
      'No locatedPixelResult found in planner response',
    ]);
  });

  it('appends reference image messages for multimodal locate prompts', async () => {
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    if (autoGlmAdapter.locate.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom locate adapter');
    }
    rs.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content:
        '<think>Found matching icon</think><answer>do(action="Tap", element=[500,500])</answer>',
    });

    await AiLocateElement({
      ...createLocateOptions(),
      targetElementDescription: {
        prompt: 'matching icon',
        images: [
          {
            name: 'target',
            url: 'data:image/png;base64,REFERENCE==',
          },
        ],
      },
    });

    const messages = rs.mocked(callAIWithStringResponse).mock.calls[0]?.[0];
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('reference images'),
            }),
          ]),
        }),
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining("reference image named 'target'"),
            }),
          ]),
        }),
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'image_url',
              image_url: expect.objectContaining({
                url: 'data:image/png;base64,REFERENCE==',
              }),
            }),
          ]),
        }),
      ]),
    );
  });
});
