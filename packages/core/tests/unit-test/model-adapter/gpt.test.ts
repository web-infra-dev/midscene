import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { gptAdapters } from '@/ai-model/models/gpt';
import { describe, expect, it } from '@rstest/core';

const gpt5Adapter = new ResolvedModelAdapter(gptAdapters['gpt-5'], 'gpt-5');
const gpt6Adapter = new ResolvedModelAdapter(gptAdapters['gpt-6'], 'gpt-6');

describe('GPT Codex App Server parameters', () => {
  it.each([
    {},
    { reasoningEnabled: true },
    { reasoningEnabled: false },
    { reasoningEffort: 'max' },
    { reasoningEnabled: true, reasoningEffort: 'high' },
    { reasoningEnabled: false, reasoningEffort: 'max' },
  ] as const)(
    'shares reasoning policy across providers for %j',
    (userConfig) => {
      for (const adapter of [gpt5Adapter, gpt6Adapter]) {
        expect(
          adapter.buildCodexAppServerParams({ userConfig }).config,
        ).toEqual({
          effort: adapter.chatCompletion.buildChatCompletionParams({
            userConfig,
          }).config.reasoning_effort,
        });
      }
    },
  );
});

describe('GPT provider-default reasoning', () => {
  it.each([undefined, 'high', 'max'])(
    'omits reasoning controls even with effort %s',
    (reasoningEffort) => {
      for (const adapter of [gpt5Adapter, gpt6Adapter]) {
        const input = {
          userConfig: {
            reasoningEnabled: 'default' as const,
            reasoningEffort,
            reasoningBudget: 1024,
          },
        };
        const chatConfig =
          adapter.chatCompletion.buildChatCompletionParams(input).config;
        const codexConfig = adapter.buildCodexAppServerParams(input).config;
        expect(JSON.parse(JSON.stringify(chatConfig))).not.toHaveProperty(
          'reasoning_effort',
        );
        expect(JSON.parse(JSON.stringify(codexConfig))).not.toHaveProperty(
          'effort',
        );
        expect(chatConfig).not.toHaveProperty('reasoning_budget');
      }
    },
  );
});

describe('gpt-6 model adapter', () => {
  it.each([undefined, false])(
    'defaults reasoning to low when enabled=%s',
    (reasoningEnabled) => {
      expect(
        gpt6Adapter.chatCompletion.buildChatCompletionParams({
          userConfig: { reasoningEnabled },
        }).config,
      ).toEqual({ reasoning_effort: 'low' });
    },
  );

  it('defaults enabled reasoning to medium', () => {
    expect(
      gpt6Adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { reasoningEnabled: true },
      }).config.reasoning_effort,
    ).toBe('medium');
  });

  it.each(['low', 'medium', 'high', 'xhigh', 'max'])(
    'supports explicit effort %s',
    (reasoningEffort) => {
      expect(
        gpt6Adapter.chatCompletion.buildChatCompletionParams({
          userConfig: { reasoningEnabled: true, reasoningEffort },
        }).config.reasoning_effort,
      ).toBe(reasoningEffort);
    },
  );

  it.each([undefined, false])(
    'ignores explicit effort when enabled=%s',
    (reasoningEnabled) => {
      expect(
        gpt6Adapter.chatCompletion.buildChatCompletionParams({
          userConfig: { reasoningEnabled, reasoningEffort: 'high' },
        }).config.reasoning_effort,
      ).toBe('low');
    },
  );

  it.each([0, 1])(
    'omits temperature and reasoning budget on retry %s',
    (semanticRetryAttempt) => {
      expect(
        gpt6Adapter.chatCompletion.buildChatCompletionParams({
          userConfig: { temperature: 0.7, reasoningBudget: 1024 },
          semanticRetryAttempt,
        }).config,
      ).toEqual({ reasoning_effort: 'low' });
      expect(
        gpt6Adapter.chatCompletion.buildChatCompletionParams({
          semanticRetryAttempt,
        }).config,
      ).toEqual({ reasoning_effort: 'low' });
    },
  );

  it('uses JSON mode only when requested and not disabled', () => {
    expect(
      gpt6Adapter.chatCompletion.buildChatCompletionParams({
        expectedJsonObjectResponse: true,
      }).config.response_format,
    ).toEqual({ type: 'json_object' });
    expect(
      gpt6Adapter.chatCompletion.buildChatCompletionParams({
        expectedJsonObjectResponse: true,
        userConfig: { responseFormat: 'none' },
      }).config.response_format,
    ).toBeUndefined();
  });
});

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

  it('uses json_object response format when expected for gpt-5', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
      userConfig: {},
    });

    expect(result.config.response_format).toEqual({ type: 'json_object' });
  });

  it('does not use json_object response format when disabled', () => {
    const result = gpt5Adapter.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
      userConfig: { responseFormat: 'none' },
    });

    expect(result.config.response_format).toBeUndefined();
  });
});
