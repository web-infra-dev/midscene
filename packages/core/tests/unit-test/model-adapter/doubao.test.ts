import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { doubaoAdapters } from '@/ai-model/models/doubao/adapter';
import { describe, expect, it } from '@rstest/core';

const doubaoVisionAdapter = new ResolvedModelAdapter(
  doubaoAdapters['doubao-vision'],
  'doubao-vision',
);
const doubaoSeedAdapter = new ResolvedModelAdapter(
  doubaoAdapters['doubao-seed'],
  'doubao-seed',
);

describe('doubao model adapter', () => {
  describe.each(['doubao-seed', 'doubao-vision'] as const)(
    '%s reasoning parameters',
    (family) => {
      const adapter = new ResolvedModelAdapter(doubaoAdapters[family], family);

      it.each([
        {
          reasoningEnabled: undefined,
          native: { thinking: { type: 'disabled' } },
          openRouter: { reasoning: { enabled: false } },
        },
        {
          reasoningEnabled: false,
          native: { thinking: { type: 'disabled' } },
          openRouter: { reasoning: { enabled: false } },
        },
        {
          reasoningEnabled: true,
          native: { thinking: { type: 'enabled' }, reasoning_effort: 'high' },
          openRouter: { reasoning: { enabled: true, max_tokens: 1024 } },
        },
        {
          reasoningEnabled: 'default',
          native: {},
          openRouter: {},
        },
      ] as const)(
        'maps enabled=$reasoningEnabled for both endpoints',
        ({ reasoningEnabled, native, openRouter }) => {
          for (const [baseURL, expected] of [
            ['https://ark.cn-beijing.volces.com/api/v3', native],
            ['https://openrouter.ai/api/v1', openRouter],
          ] as const) {
            const result = adapter.chatCompletion.buildChatCompletionParams({
              baseURL,
              expectedJsonObjectResponse: true,
              userConfig: {
                reasoningEnabled,
                reasoningEffort: 'high',
                reasoningBudget: 1024,
                temperature: 0.7,
              },
            });
            expect(result.config).toEqual({
              temperature: 0.7,
              response_format: { type: 'json_object' },
              ...expected,
            });
          }
        },
      );

      it('omits reasoning configuration when using default without effort', () => {
        for (const baseURL of [undefined, 'https://openrouter.ai/api/v1']) {
          const result = adapter.chatCompletion.buildChatCompletionParams({
            baseURL,
            userConfig: { reasoningEnabled: 'default' },
          });
          expect(result.config).toEqual({ temperature: 0 });
        }
      });
    },
  );

  it('keeps doubao-seed and doubao-vision json parsing behavior aligned', () => {
    expect(doubaoSeedAdapter.jsonParser).toBe(doubaoVisionAdapter.jsonParser);
  });

  it('defaults doubao thinking to disabled when reasoning config is unset', () => {
    const result = doubaoSeedAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('uses json_object response format when expected unless disabled', () => {
    const autoResult =
      doubaoVisionAdapter.chatCompletion.buildChatCompletionParams({
        expectedJsonObjectResponse: true,
        userConfig: {},
      });
    const disabledResult =
      doubaoVisionAdapter.chatCompletion.buildChatCompletionParams({
        expectedJsonObjectResponse: true,
        userConfig: { responseFormat: 'none' },
      });

    expect(autoResult.config.response_format).toEqual({ type: 'json_object' });
    expect(disabledResult.config.response_format).toBeUndefined();
  });

  it('preserves midscene defaults and applies explicit doubao temperature override', () => {
    const chatCompletion = doubaoAdapters['doubao-seed'].chatCompletion;
    expect(chatCompletion).toBeDefined();
    if (!chatCompletion) {
      throw new Error('doubao-seed should define chat completion adapter');
    }
    const buildChatCompletionParams = chatCompletion.buildChatCompletionParams;
    expect(buildChatCompletionParams).toBeDefined();
    if (!buildChatCompletionParams) {
      throw new Error(
        'doubao-seed should define chat completion params builder',
      );
    }

    const result = buildChatCompletionParams({
      midsceneDefaults: {
        temperature: 0,
        seed: 123,
      } as any,
      userConfig: {
        temperature: 0.7,
        reasoningEnabled: true,
      },
    });

    expect(result.config).toEqual({
      temperature: 0.7,
      seed: 123,
      thinking: { type: 'enabled' },
    });
  });

  it('omits maxTokens from adapter-owned chat completion params', () => {
    const result = doubaoSeedAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        maxTokens: 2048,
      } as any,
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('maps reasoningEnabled to thinking.type for doubao-vision', () => {
    const result = doubaoVisionAdapter.chatCompletion.buildChatCompletionParams(
      {
        userConfig: {
          reasoningEnabled: true,
        },
      },
    );
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'enabled' },
    });
  });

  it('maps reasoningEnabled=false to thinking.type=disabled for doubao-seed', () => {
    const result = doubaoSeedAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: false,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('maps reasoningEnabled with reasoningEffort for doubao-vision', () => {
    const result = doubaoVisionAdapter.chatCompletion.buildChatCompletionParams(
      {
        userConfig: {
          reasoningEnabled: true,
          reasoningEffort: 'medium',
        },
      },
    );
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'enabled' },
      reasoning_effort: 'medium',
    });
  });

  it('maps both reasoningEnabled and reasoningEffort for doubao-seed', () => {
    const result = doubaoSeedAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningEffort: 'high',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });
  });

  it('follows provider default and ignores effort for doubao when reasoningEnabled=default', () => {
    const result = doubaoSeedAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: 'default',
        reasoningEffort: 'high',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
    });
  });

  it('ignores reasoningBudget for doubao', () => {
    const result = doubaoSeedAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningBudget: 1024,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
  });

  it('parses locate-like JSON through the shared parser', () => {
    const parser = doubaoVisionAdapter.jsonParser;
    const context = { source: 'locate' as const };
    expect(parser('{"bbox": [123 456]}', context)).toEqual({
      bbox: [123, 456],
    });
    expect(parser('{"bbox": [1 4]}', context)).toEqual({ bbox: [1, 4] });
    expect(parser('{"bbox": [123 456,789 100]}', context)).toEqual({
      bbox: [123, 456, 789, 100],
    });
    expect(parser('{"bbox": [940 445 969 490]}', context)).toEqual({
      bbox: [940, 445, 969, 490],
    });
    expect(() => parser('123 345 11111', context)).toThrow();

    const input = `
{
  "bbox": [
    "550 216",
    "550 216",
    "550 216",
    "550 216"
  ]
}
    `;
    expect(parser(input, context)).toEqual({
      bbox: ['550 216', '550 216', '550 216', '550 216'],
    });
  });

  it('does not repair malformed json for generic parser sources', () => {
    const parser = doubaoVisionAdapter.jsonParser;

    expect(() => parser('```', { source: 'generic-object' })).toThrow();
  });

  it('normalizes parsed doubao json while preserving configured string values', () => {
    const parser = doubaoVisionAdapter.jsonParser;

    expect(
      parser('{" value ": "  keep spaces  ", " bbox ": [" 123 456 "]}', {
        source: 'locate',
        preserveStringValueKeys: ['value'],
      }),
    ).toEqual({
      value: '  keep spaces  ',
      bbox: ['123 456'],
    });
  });

  it('repairs planning action params with bbox coordinates', () => {
    const parser = doubaoVisionAdapter.jsonParser;
    expect(
      parser('{"locate": {"bbox": [123 456 789 100]}}', {
        source: 'planning-action-param',
      }),
    ).toEqual({
      locate: { bbox: [123, 456, 789, 100] },
    });
  });
});
