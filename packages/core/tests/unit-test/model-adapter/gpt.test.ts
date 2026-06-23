import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { gptAdapters } from '@/ai-model/models/gpt';
import { describe, expect, it } from 'vitest';

const gpt5Adapter = new ResolvedModelAdapter(gptAdapters['gpt-5'], 'gpt-5');

describe('gpt model adapter', () => {
  it('keeps GPT-5 image-detail policy in the adapter', () => {
    expect(
      gpt5Adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { temperature: 0 },
      }).config.temperature,
    ).toBe(0);
    expect(
      gpt5Adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { temperature: 0.7 },
      }).config.temperature,
    ).toBe(0.7);
    expect(gpt5Adapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningBudget',
    ]);
    expect(
      gpt5Adapter.chatCompletion.resolveImageDetail({
        intent: 'default',
        userConfig: {},
      }),
    ).toBe('original');
    expect(
      gpt5Adapter.chatCompletion.resolveImageDetail({
        intent: 'planning',
        userConfig: {},
      }),
    ).toBeUndefined();
    expect(
      gpt5Adapter.chatCompletion.resolveImageDetail({
        intent: 'planning',
        userConfig: {},
        requiresOriginalImageDetail: true,
      }),
    ).toBe('original');
    expect(gpt5Adapter.imagePreprocess).toEqual({});
  });

  it('defaults gpt-5 reasoning to disabled when reasoning config is unset', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });
    expect(result.config).toEqual({
      temperature: 0,
      reasoning_effort: 'none',
    });
  });

  it('omits token limit from adapter-owned GPT-5 chat completion params', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        maxTokens: 2048,
      } as any,
    });
    expect(result.config).toEqual({
      temperature: 0,
      reasoning_effort: 'none',
    });
  });

  it('preserves midscene defaults and applies explicit gpt-5 temperature override', () => {
    const result = gptAdapters[
      'gpt-5'
    ].chatCompletion?.buildChatCompletionParams({
      midsceneDefaults: {
        temperature: 0,
        seed: 123,
      } as any,
      userConfig: {
        temperature: 0.7,
        reasoningEnabled: true,
      },
    });

    expect(result?.config).toEqual({
      temperature: 0.7,
      seed: 123,
      reasoning_effort: 'medium',
    });
  });

  it('maps reasoningEnabled to reasoning_effort for gpt-5', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      reasoning_effort: 'medium',
    });
  });

  it('maps reasoningEnabled=false to reasoning_effort=none for gpt-5', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: false,
        reasoningEffort: 'low',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      reasoning_effort: 'none',
    });
  });

  it('maps explicit reasoningEffort when gpt-5 reasoning is enabled', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningEffort: 'high',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      reasoning_effort: 'high',
    });
  });

  it('ignores unsupported reasoning budget for gpt-5', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningBudget: 1024,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      reasoning_effort: 'none',
    });
  });
});
