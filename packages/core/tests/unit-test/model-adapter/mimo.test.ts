import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { mimoAdapters } from '@/ai-model/models/mimo';
import { describe, expect, it } from 'vitest';

const mimoAdapter = new ResolvedModelAdapter(
  mimoAdapters['xiaomi-mimo'],
  'xiaomi-mimo',
);

describe('mimo model adapter', () => {
  it('defaults mimo thinking to disabled when reasoning config is unset', () => {
    const result = mimoAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });

    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('preserves midscene defaults and applies explicit mimo temperature override', () => {
    const chatCompletion = mimoAdapters['xiaomi-mimo'].chatCompletion;
    expect(chatCompletion).toBeDefined();
    if (!chatCompletion) {
      throw new Error('xiaomi-mimo should define chat completion adapter');
    }
    const buildChatCompletionParams = chatCompletion.buildChatCompletionParams;
    expect(buildChatCompletionParams).toBeDefined();
    if (!buildChatCompletionParams) {
      throw new Error(
        'xiaomi-mimo should define chat completion params builder',
      );
    }

    const result = buildChatCompletionParams({
      midsceneDefaults: {
        temperature: 0,
        seed: 123,
      } as any,
      userConfig: {
        temperature: 0.7,
        reasoningEnabled: false,
      },
    });

    expect(result.config).toEqual({
      temperature: 0.7,
      seed: 123,
      thinking: { type: 'disabled' },
    });
  });

  it('maps reasoningEnabled to thinking.type for xiaomi-mimo', () => {
    const disabledResult = mimoAdapter.chatCompletion.buildChatCompletionParams(
      {
        userConfig: {
          reasoningEnabled: false,
        },
      },
    );
    const enabledResult = mimoAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
      },
    });

    expect(disabledResult.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
    expect(enabledResult.config).toEqual({
      temperature: 0,
      thinking: { type: 'enabled' },
    });
  });

  it('ignores unsupported reasoning effort and budget params', () => {
    const result = mimoAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEffort: 'high',
        reasoningBudget: 1024,
      },
    });

    expect(mimoAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEffort',
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('keeps user temperature in chat completion params', () => {
    const result = mimoAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        temperature: 0.7,
      },
    });

    expect(result.config).toEqual({
      temperature: 0.7,
      thinking: { type: 'disabled' },
    });
  });

  it('does not set response format without an expected JSON object response', () => {
    const result = mimoAdapter.chatCompletion.buildChatCompletionParams({
      intent: 'default',
      userConfig: {},
    });

    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('uses json_object response format when expected', () => {
    const expectedResult = mimoAdapter.chatCompletion.buildChatCompletionParams(
      {
        intent: 'planning',
        expectedJsonObjectResponse: true,
        userConfig: {},
      },
    );

    expect(expectedResult.config.response_format).toEqual({
      type: 'json_object',
    });
  });

  it('does not use json_object response format when disabled', () => {
    const result = mimoAdapter.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
      userConfig: { responseFormat: 'none' },
    });

    expect(result.config.response_format).toBeUndefined();
  });
});
