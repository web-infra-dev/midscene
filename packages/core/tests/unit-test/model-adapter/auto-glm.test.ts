import { ConversationHistory } from '@/ai-model/conversation-history';
import { autoGlmAdapters } from '@/ai-model/models/auto-glm/adapter';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import type { LocateOptions } from '@/ai-model/workflows/inspect/types';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { UIContext } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/service-caller/index', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/ai-model/service-caller/index')>();
  return {
    ...actual,
    callAIWithStringResponse: vi.fn(),
  };
});

const autoGlmAdapter = new ResolvedModelAdapter(
  autoGlmAdapters['auto-glm'],
  'auto-glm',
);
const multilingualAdapter = new ResolvedModelAdapter(
  autoGlmAdapters['auto-glm-multilingual'],
  'auto-glm-multilingual',
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

function createPlanOptions(): PlanOptions {
  return {
    context,
    actionSpace: [],
    modelRuntime: {
      config: {
        modelName: 'auto-glm-test-model',
        modelFamily: 'auto-glm',
        modelDescription: 'auto-glm-test-model',
        intent: 'planning',
        slot: 'planning',
      },
      adapter: autoGlmAdapter,
    } as any,
    conversationHistory: new ConversationHistory(),
    includeLocateInPlanning: true,
  };
}

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

describe('auto-glm model adapter', () => {
  beforeEach(() => {
    vi.mocked(callAIWithStringResponse).mockReset();
  });

  it('keeps Auto-GLM prompt selectors in the adapter', () => {
    const autoGlmPlanning = autoGlmAdapter.planning;
    const multilingualPlanning = multilingualAdapter.planning;
    expect(autoGlmPlanning.kind).toBe('custom');
    expect(multilingualPlanning.kind).toBe('custom');
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    expect(multilingualAdapter.locate.kind).toBe('custom');
    if (
      autoGlmPlanning.kind !== 'custom' ||
      multilingualPlanning.kind !== 'custom'
    ) {
      throw new Error('Auto-GLM should use custom planning adapter');
    }
    expect(autoGlmPlanning.planFn).not.toBe(multilingualPlanning.planFn);
    expect(autoGlmAdapter.locate).not.toBe(multilingualAdapter.locate);
  });

  it('keeps Auto-GLM planning defaults in the adapter', () => {
    expect(autoGlmAdapter.planning.kind).toBe('custom');
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    expect(autoGlmAdapter.planning.cacheEnabled).toBe(false);
    expect(autoGlmAdapter.planning.defaultReplanningCycleLimit).toBe(100);
    expect(autoGlmAdapter.planning.supportsActionDeepLocate).toBe(false);
    expect(autoGlmAdapter.locate.supportsSearchArea).toBe(false);
  });

  it('keeps Auto-GLM request penalties without reasoning params', () => {
    const result = autoGlmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });
    expect(autoGlmAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEnabled',
      'reasoningEffort',
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: 0,
      top_p: 0.85,
      frequency_penalty: 0.2,
    });
  });

  it('preserves midscene defaults and applies explicit Auto-GLM temperature override', () => {
    const chatCompletion = autoGlmAdapters['auto-glm'].chatCompletion;
    expect(chatCompletion).toBeDefined();
    if (!chatCompletion) {
      throw new Error('Auto-GLM should define chat completion adapter');
    }
    const buildChatCompletionParams = chatCompletion.buildChatCompletionParams;
    expect(buildChatCompletionParams).toBeDefined();
    if (!buildChatCompletionParams) {
      throw new Error('Auto-GLM should define chat completion params builder');
    }

    const result = buildChatCompletionParams({
      midsceneDefaults: {
        temperature: 0,
        seed: 123,
      } as any,
      userConfig: {
        temperature: 0.7,
      },
    });

    expect(result.config).toEqual({
      temperature: 0.7,
      seed: 123,
      top_p: 0.85,
      frequency_penalty: 0.2,
    });
  });

  it('ignores reasoning config for Auto-GLM adapters', () => {
    const result = autoGlmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningBudget: 1024,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      top_p: 0.85,
      frequency_penalty: 0.2,
    });
    const multilingualResult =
      multilingualAdapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEffort: 'high',
        },
      });
    expect(multilingualResult.config).toEqual({
      temperature: 0,
      top_p: 0.85,
      frequency_penalty: 0.2,
    });
  });

  it('runs Auto-GLM custom planning and transforms tap coordinates', async () => {
    expect(autoGlmAdapter.planning.kind).toBe('custom');
    if (autoGlmAdapter.planning.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom planning adapter');
    }
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content:
        '<think>Need to click submit</think><answer>do(action="Tap", element=[500,500])</answer>',
      usage: { total_tokens: 12 } as any,
    });

    const result = await autoGlmAdapter.planning.planFn(
      'click submit',
      createPlanOptions(),
    );

    expect(callAIWithStringResponse).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]),
      expect.objectContaining({
        config: expect.objectContaining({ modelFamily: 'auto-glm' }),
      }),
      expect.any(Object),
    );
    expect(result.actions).toMatchObject([
      {
        type: 'Tap',
        param: {
          locate: {
            locatedPixelBbox: [490, 392, 509, 407],
          },
        },
      },
    ]);
    expect(result.shouldContinuePlanning).toBe(true);
    expect(result.usage).toEqual({ total_tokens: 12 });
  });

  it('stops Auto-GLM custom planning on finish action', async () => {
    expect(autoGlmAdapter.planning.kind).toBe('custom');
    if (autoGlmAdapter.planning.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom planning adapter');
    }
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'Task is done. finish(message="done")',
    });

    const result = await autoGlmAdapter.planning.planFn(
      'finish the task',
      createPlanOptions(),
    );

    expect(result.actions).toMatchObject([
      {
        type: 'Finished',
        param: {},
        thought: 'done',
      },
    ]);
    expect(result.shouldContinuePlanning).toBe(false);
  });

  it('wraps Auto-GLM planning parse failures with raw response and usage', async () => {
    expect(autoGlmAdapter.planning.kind).toBe('custom');
    if (autoGlmAdapter.planning.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom planning adapter');
    }
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'do(action="UnknownAction")',
      usage: { total_tokens: 3 } as any,
    });

    await expect(
      autoGlmAdapter.planning.planFn('click submit', createPlanOptions()),
    ).rejects.toMatchObject({
      name: 'AIResponseParseError',
      rawResponse: '"do(action=\\"UnknownAction\\")"',
      usage: { total_tokens: 3 },
    });
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

    const result = await autoGlmAdapter.locate.locateFn(
      'submit button',
      createLocateOptions(),
    );

    expect(callAIWithStringResponse).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
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

  it('returns parse errors from Auto-GLM custom locate responses', async () => {
    expect(autoGlmAdapter.locate.kind).toBe('custom');
    if (autoGlmAdapter.locate.kind !== 'custom') {
      throw new Error('Auto-GLM should use custom locate adapter');
    }
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'do(action="Swipe", start=[100,200], end=[300,400])',
    });

    const result = await autoGlmAdapter.locate.locateFn(
      'submit button',
      createLocateOptions(),
    );

    expect(result.rect).toBeUndefined();
    expect(result.parseResult.element).toBeUndefined();
    expect(result.parseResult.errors).toEqual([
      'Unexpected action type in auto-glm locate response: do(action="Swipe", start=[100,200], end=[300,400])',
    ]);
  });
});
