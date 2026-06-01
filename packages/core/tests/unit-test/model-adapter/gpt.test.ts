import { gptAdapters } from '@/ai-model/models/gpt';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { describe, expect, it } from 'vitest';

const gpt5Adapter = new ResolvedModelAdapter(gptAdapters['gpt-5'], 'gpt-5');

describe('gpt model adapter', () => {
  it('keeps GPT-5 temperature and image-detail policy in the adapter', () => {
    expect(
      gpt5Adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { temperature: 0 },
      }).config.temperature,
    ).toBeUndefined();
    expect(
      gpt5Adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { temperature: 0.7 },
      }).config.temperature,
    ).toBeUndefined();
    expect(gpt5Adapter.chatCompletion.unsupportedUserConfig).toEqual([
      'temperature',
      'reasoningEnabled',
      'reasoningEffort',
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

  it('omits token limit for gpt-5 when reasoning config is unset', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });
    expect(result.config).toEqual({
      temperature: undefined,
    });
  });

  it('omits token limit from adapter-owned GPT-5 chat completion params', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        maxTokens: 2048,
      } as any,
    });
    expect(result.config).toEqual({
      temperature: undefined,
    });
  });

  it('keeps unsupported config out of gpt-5 HTTP params', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        temperature: 0.7,
        reasoningEnabled: true,
        reasoningEffort: 'low',
        reasoningBudget: 1024,
      },
    });
    expect(result.config).toEqual({
      temperature: undefined,
    });
  });
});
