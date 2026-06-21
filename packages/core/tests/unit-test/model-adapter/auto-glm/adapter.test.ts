import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { autoGlmAdapters } from '@/ai-model/models/auto-glm/adapter';
import { describe, expect, it } from 'vitest';

const autoGlmAdapter = new ResolvedModelAdapter(
  autoGlmAdapters['auto-glm'],
  'auto-glm',
);
const multilingualAdapter = new ResolvedModelAdapter(
  autoGlmAdapters['auto-glm-multilingual'],
  'auto-glm-multilingual',
);

describe('auto-glm model adapter', () => {
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
});
