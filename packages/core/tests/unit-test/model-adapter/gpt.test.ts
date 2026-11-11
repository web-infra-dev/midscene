import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { gptAdapters } from '@/ai-model/models/gpt';
import { describe, expect, it } from '@rstest/core';

const gpt5Adapter = new ResolvedModelAdapter(gptAdapters['gpt-5'], 'gpt-5');
const gpt6Adapter = new ResolvedModelAdapter(gptAdapters['gpt-6'], 'gpt-6');

it.each(['gpt-5', 'gpt-6'] as const)(
  '%s uses current-turn reasoning with text-only history',
  (family) => {
    const adapter = new ResolvedModelAdapter(gptAdapters[family], family);
    expect(adapter.responses.replayRawAssistantOutput).toBe(false);
    expect(adapter.chatCompletion.replayRawAssistantMessage).toBe(false);
    expect(
      adapter.responses.buildResponsesParams({ userConfig: {} }).config
        .reasoning,
    ).toMatchObject({ context: 'current_turn' });
  },
);

describe.each(['gpt-5', 'gpt-6'] as const)(
  '%s Responses JSON mode',
  (family) => {
    const adapter = new ResolvedModelAdapter(gptAdapters[family], family);

    it.each([
      {
        responseFormat: undefined,
        expectedJsonObjectResponse: true,
        enabled: true,
      },
      {
        responseFormat: 'auto',
        expectedJsonObjectResponse: true,
        enabled: true,
      },
      {
        responseFormat: 'none',
        expectedJsonObjectResponse: true,
        enabled: false,
      },
      {
        responseFormat: 'auto',
        expectedJsonObjectResponse: false,
        enabled: false,
      },
    ] as const)(
      'handles %j',
      ({ responseFormat, expectedJsonObjectResponse, enabled }) => {
        const { config } = adapter.responses.buildResponsesParams({
          userConfig: { responseFormat },
          expectedJsonObjectResponse,
        });
        expect(config.text).toEqual(
          enabled ? { format: { type: 'json_object' } } : undefined,
        );
        expect(config).not.toHaveProperty('response_format');
      },
    );
  },
);

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
    'preserves explicit effort %s with provider defaults',
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
        expect(chatConfig.reasoning_effort).toBe(reasoningEffort);
        expect(codexConfig.effort).toBe(reasoningEffort);
        expect(
          adapter.responses.buildResponsesParams(input).config.reasoning,
        ).toEqual({ effort: reasoningEffort, context: 'current_turn' });
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
      gpt5Adapter.resolveImageDetail({
        intent: 'locate',
      }),
    ).toBe('original');
    expect(
      gpt5Adapter.resolveImageDetail({
        intent: 'planning',
      }),
    ).toBe('high');
    expect(gpt5Adapter.resolveImageDetail({ intent: 'default' })).toBe('high');
    expect(
      gpt5Adapter.resolveImageDetail({
        intent: 'planning',
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

it.each(['low', 'auto', 'high'] as const)(
  'preserves per-image %s detail unless GPT requires original',
  (imageDetail) => {
    expect(
      gpt5Adapter.resolveImageDetail({ intent: 'planning', imageDetail }),
    ).toBe(imageDetail);
    expect(
      gpt5Adapter.resolveImageDetail({ intent: 'locate', imageDetail }),
    ).toBe('original');
  },
);

describe.each(['gpt-5', 'gpt-6'] as const)('%s bbox boundaries', (family) => {
  const adapter = new ResolvedModelAdapter(gptAdapters[family], family);

  it('accepts image-edge endpoints for element and search-area results', () => {
    if (adapter.locate.kind !== 'standard' || !adapter.locate.searchArea) {
      throw new Error('Expected standard element and search-area locate');
    }
    for (const { resultCodec } of [
      adapter.locate.element,
      adapter.locate.searchArea,
    ]) {
      expect(
        resultCodec.toPixelResult([1600, 1600, 2000, 2000], {
          preparedSize: { width: 2000, height: 2000 },
        }),
      ).toEqual({
        center: [1800, 1800],
        rect: { left: 1600, top: 1600, width: 400, height: 400 },
      });
      // Variants returning the last pixel index remain accepted.
      expect(
        resultCodec.toPixelResult([1600, 1600, 1999, 1999], {
          preparedSize: { width: 2000, height: 2000 },
        }),
      ).toEqual({
        center: [1800, 1800],
        rect: { left: 1600, top: 1600, width: 399, height: 399 },
      });
      expect(
        resultCodec.toPixelResult([430, 240, 850, 720], {
          preparedSize: { width: 1280, height: 720 },
        }),
      ).toEqual({
        center: [640, 480],
        rect: { left: 430, top: 240, width: 420, height: 480 },
      });
      expect(() =>
        resultCodec.toPixelResult([1600, 1600, 2001, 2000], {
          preparedSize: { width: 2000, height: 2000 },
        }),
      ).toThrow(/exceed/);
    }
  });
});

describe.each(['gpt-5', 'gpt-6'] as const)(
  '%s OpenRouter reasoning',
  (family) => {
    const adapter = new ResolvedModelAdapter(gptAdapters[family], family);

    it.each([
      { userConfig: {}, gpt5: { effort: 'none' }, gpt6: { effort: 'low' } },
      {
        userConfig: {
          reasoningEnabled: false,
          reasoningEffort: 'high',
          reasoningBudget: 1024,
        },
        gpt5: { effort: 'none' },
        gpt6: { effort: 'low' },
      },
      {
        userConfig: { reasoningEnabled: true },
        gpt5: { effort: 'medium' },
        gpt6: { effort: 'medium' },
      },
      {
        userConfig: {
          reasoningEnabled: true,
          reasoningEffort: 'high',
          reasoningBudget: 1024,
        },
        gpt5: { effort: 'high' },
        gpt6: { effort: 'high' },
      },
      {
        userConfig: { reasoningEnabled: 'default' },
        gpt5: undefined,
        gpt6: undefined,
      },
      {
        userConfig: {
          reasoningEnabled: 'default',
          reasoningEffort: 'high',
          reasoningBudget: 1024,
        },
        gpt5: { effort: 'high' },
        gpt6: { effort: 'high' },
      },
      {
        userConfig: { reasoningEnabled: 'default', reasoningBudget: 1024 },
        gpt5: undefined,
        gpt6: undefined,
      },
    ] as const)(
      'maps %j across Chat and Responses',
      ({ userConfig, gpt5, gpt6 }) => {
        const input = {
          baseURL: 'https://openrouter.ai/api/v1',
          userConfig,
          expectedJsonObjectResponse: true,
        };
        const chat =
          adapter.chatCompletion.buildChatCompletionParams(input).config;
        const responses = adapter.responses.buildResponsesParams(input).config;
        for (const config of [chat, responses]) {
          expect(config.reasoning).toEqual(family === 'gpt-5' ? gpt5 : gpt6);
          expect(config).not.toHaveProperty('reasoning_effort');
          expect(config).not.toHaveProperty('reasoning_budget');
          if ((family === 'gpt-5' ? gpt5 : gpt6) === undefined) {
            expect(config).not.toHaveProperty('reasoning');
          }
        }
        expect(chat.response_format).toEqual({ type: 'json_object' });
        expect(responses.text).toEqual({ format: { type: 'json_object' } });
      },
    );
  },
);
