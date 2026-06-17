import { AiLocateElement } from '@/ai-model/inspect';
import { autoGlmAdapters } from '@/ai-model/models/auto-glm/adapter';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import type { LocateOptions } from '@/ai-model/workflows/inspect/types';
import type { UIContext } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../../../src/ai-model/service-caller/index', () => {
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
    vi.mocked(callAIWithStringResponse).mockReset();
  });

  it('runs Auto-GLM custom locate and maps normalized coordinates to a rect', async () => {
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    if (autoGlmAdapter.locate.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom locate adapter');
    }
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
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
    expect(result.rect).toEqual({
      left: 490,
      top: 392,
      width: 20,
      height: 16,
    });
    expect(result.parseResult.errors).toEqual([]);
    expect(result.parseResult.element).toMatchObject({
      rect: result.rect,
    });
    expect(result.reasoning_content).toContain('Found submit');
    expect(result.usage).toEqual({ total_tokens: 8 });
  });

  it('uses search area image size for planning and maps the rect back to the original screenshot', async () => {
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    if (autoGlmAdapter.locate.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom locate adapter');
    }
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
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

    const messages = vi.mocked(callAIWithStringResponse).mock.calls[0]?.[0];
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
    expect(result.rect).toEqual({
      left: 347,
      top: 198,
      width: 6,
      height: 4,
    });
  });

  it('returns parse errors from Auto-GLM custom locate responses', async () => {
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    if (autoGlmAdapter.locate.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom locate adapter');
    }
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'do(action="Swipe", start=[100,200], end=[300,400])',
    });

    const result = await AiLocateElement({
      ...createLocateOptions(),
      targetElementDescription: 'submit button',
    });

    expect(result.rect).toBeUndefined();
    expect(result.parseResult.element).toBeUndefined();
    expect(result.parseResult.errors).toEqual([
      'No locatedPixelBbox found in planner response',
    ]);
  });

  it('appends reference image messages for multimodal locate prompts', async () => {
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    if (autoGlmAdapter.locate.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom locate adapter');
    }
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
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

    const messages = vi.mocked(callAIWithStringResponse).mock.calls[0]?.[0];
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
