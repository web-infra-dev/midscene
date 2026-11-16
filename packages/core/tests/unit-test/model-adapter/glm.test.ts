import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { glmAdapters } from '@/ai-model/models/glm';
import { describe, expect, it } from '@rstest/core';

const glmAdapter = new ResolvedModelAdapter(glmAdapters['glm-v'], 'glm-v');

describe('glm model adapter', () => {
  describe.each([
    { baseURL: 'https://open.bigmodel.cn/api/paas/v4', openRouter: false },
    { baseURL: 'https://openrouter.ai/api/v1', openRouter: true },
  ])('reasoning parameters for $baseURL', ({ baseURL, openRouter }) => {
    it.each([undefined, false, true, 'default'] as const)(
      'maps enabled=%s with endpoint-specific effort and budget handling',
      (reasoningEnabled) => {
        const result = glmAdapter.chatCompletion.buildChatCompletionParams({
          baseURL,
          expectedJsonObjectResponse: true,
          userConfig: {
            reasoningEnabled,
            reasoningEffort: 'high',
            reasoningBudget: 1024,
            temperature: 0.7,
          },
        });
        const thinkingConfig =
          reasoningEnabled === 'default'
            ? {}
            : openRouter
              ? {
                  reasoning: {
                    enabled: reasoningEnabled ?? false,
                    ...(reasoningEnabled === true
                      ? { effort: 'high', max_tokens: 1024 }
                      : {}),
                  },
                }
              : {
                  thinking: {
                    type: reasoningEnabled ? 'enabled' : 'disabled',
                  },
                };

        expect(result.config).toEqual({
          temperature: 0.7,
          response_format: { type: 'json_object' },
          ...thinkingConfig,
        });
      },
    );
  });

  it('defaults glm-v thinking to disabled when reasoning config is unset', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('preserves midscene defaults and applies explicit glm-v temperature override', () => {
    const result = glmAdapters[
      'glm-v'
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
      thinking: { type: 'enabled' },
    });
  });

  it('maps reasoningEnabled to thinking.type for glm-v', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'enabled' },
    });
  });

  it('maps reasoningEnabled=false to thinking.type=disabled for glm-v', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: false,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('follows provider default for glm-v when reasoningEnabled=default', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: 'default',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
    });
  });

  it('ignores unsupported reasoning fields for glm-v', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEffort: 'high',
        reasoningBudget: 1024,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('uses json_object response format when expected for glm-v', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
      userConfig: {},
    });

    expect(result.config).toEqual({
      temperature: 0,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
    });
  });

  it('does not use json_object response format when disabled', () => {
    const result = glmAdapter.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
      userConfig: { responseFormat: 'none' },
    });

    expect(result.config.response_format).toBeUndefined();
  });
});
