import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { kimiAdapters } from '@/ai-model/models/kimi';
import { describe, expect, it } from '@rstest/core';

const kimiAdapter = new ResolvedModelAdapter(kimiAdapters.kimi, 'kimi');
const kimi3Adapter = new ResolvedModelAdapter(kimiAdapters.kimi3, 'kimi3');

describe('kimi model adapter', () => {
  describe.each([
    { baseURL: 'https://api.moonshot.cn/v1', openRouter: false },
    { baseURL: 'https://openrouter.ai/api/v1', openRouter: true },
  ])('reasoning parameters for $baseURL', ({ baseURL, openRouter }) => {
    it.each([undefined, false, true, 'default'] as const)(
      'maps enabled=%s with endpoint-specific effort and budget handling',
      (reasoningEnabled) => {
        const result = kimiAdapter.chatCompletion.buildChatCompletionParams({
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
                    ...(reasoningEnabled === true ? { max_tokens: 1024 } : {}),
                  },
                }
              : {
                  thinking: {
                    type: reasoningEnabled ? 'enabled' : 'disabled',
                  },
                };

        expect(result.config).toEqual({
          temperature: undefined,
          response_format: { type: 'json_object' },
          ...thinkingConfig,
        });
      },
    );
  });

  it('uses 0-1 normalized xy point coordinates for kimi locate results', () => {
    const locateAdapter = kimiAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('kimi should use standard locate adapter');
    }

    const result = locateAdapter.element.resultCodec.toPixelResult(
      [0.371, 0.109],
      { preparedSize: { width: 1920, height: 1440 } },
    );
    expect(result).toEqual({ center: [712, 157] });
  });

  it('accepts pixel xy point coordinates for kimi locate results', () => {
    const locateAdapter = kimiAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('kimi should use standard locate adapter');
    }

    const result = locateAdapter.element.resultCodec.toPixelResult([960, 540], {
      preparedSize: { width: 1920, height: 1080 },
    });
    expect(result).toEqual({ center: [960, 540] });
  });

  it('accepts pixel xy point strings for kimi locate results', () => {
    const locateAdapter = kimiAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('kimi should use standard locate adapter');
    }

    const result = locateAdapter.element.resultCodec.toPixelResult('960 540', {
      preparedSize: { width: 1920, height: 1080 },
    });
    expect(result).toEqual({ center: [960, 540] });
  });

  it.each([
    { point: [0.5, 0.5, 0.5] },
    { point: [960, 540, 100] },
    { point: '960 540 100' },
  ])(
    'rejects Kimi point results with extra coordinates: $point',
    ({ point }) => {
      const locateAdapter = kimiAdapter.locate;
      if (locateAdapter.kind !== 'standard') {
        throw new Error('kimi should use standard locate adapter');
      }
      expect(() =>
        locateAdapter.element.resultCodec.toPixelResult(point, {
          preparedSize: { width: 1920, height: 1080 },
        }),
      ).toThrow(/invalid point data/);
    },
  );

  it('rejects out-of-range kimi pixel point coordinates', () => {
    const locateAdapter = kimiAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('kimi should use standard locate adapter');
    }

    expect(
      () =>
        locateAdapter.element.resultCodec.toPixelResult([2000, 540], {
          preparedSize: { width: 1920, height: 1080 },
        }).rect,
    ).toThrow(/exceed image size/);
  });

  it('defaults kimi thinking to disabled when reasoning config is unset', () => {
    const result = kimiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });

    expect(result.config).toEqual({
      temperature: undefined,
      thinking: { type: 'disabled' },
    });
  });

  it('preserves midscene defaults while removing kimi temperature', () => {
    const chatCompletion = kimiAdapters.kimi.chatCompletion;
    expect(chatCompletion).toBeDefined();
    if (!chatCompletion) {
      throw new Error('kimi should define chat completion adapter');
    }
    const buildChatCompletionParams = chatCompletion.buildChatCompletionParams;
    expect(buildChatCompletionParams).toBeDefined();
    if (!buildChatCompletionParams) {
      throw new Error('kimi should define chat completion params builder');
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
      temperature: undefined,
      seed: 123,
      thinking: { type: 'enabled' },
    });
  });

  it('maps reasoningEnabled to thinking.type for kimi', () => {
    const result = kimiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
      },
    });

    expect(result.config).toEqual({
      temperature: undefined,
      thinking: { type: 'enabled' },
    });
  });

  it('ignores unsupported reasoning effort and budget params', () => {
    const result = kimiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEffort: 'high',
        reasoningBudget: 1024,
      },
    });

    expect(result.config).toEqual({
      temperature: undefined,
      thinking: { type: 'disabled' },
    });
  });

  it('removes user temperature from chat completion params', () => {
    const result = kimiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        temperature: 0.7,
      },
    });

    expect(result.config).toEqual({
      temperature: undefined,
      thinking: { type: 'disabled' },
    });
  });

  it('uses json_object response format when expected for kimi', () => {
    const result = kimiAdapter.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
      userConfig: {},
    });

    expect(result.config.response_format).toEqual({ type: 'json_object' });
  });

  it('does not use json_object response format when disabled', () => {
    const result = kimiAdapter.chatCompletion.buildChatCompletionParams({
      expectedJsonObjectResponse: true,
      userConfig: { responseFormat: 'none' },
    });

    expect(result.config.response_format).toBeUndefined();
  });
});

describe('kimi3 model adapter', () => {
  it.each([
    {
      reasoningEnabled: undefined,
      expected: { reasoning: { enabled: false } },
    },
    { reasoningEnabled: false, expected: { reasoning: { enabled: false } } },
    {
      reasoningEnabled: true,
      expected: {
        reasoning: { enabled: true, effort: 'high', max_tokens: 1024 },
      },
    },
    {
      reasoningEnabled: 'default',
      expected: {},
    },
  ] as const)(
    'maps OpenRouter enabled=$reasoningEnabled with effort and budget',
    ({ reasoningEnabled, expected }) => {
      expect(
        kimi3Adapter.chatCompletion.buildChatCompletionParams({
          baseURL: 'https://openrouter.ai/api/v1',
          userConfig: {
            reasoningEnabled,
            reasoningEffort: 'high',
            reasoningBudget: 1024,
          },
        }).config,
      ).toEqual({ temperature: undefined, ...expected });
    },
  );

  it('omits empty OpenRouter reasoning configuration for default', () => {
    expect(
      kimi3Adapter.chatCompletion.buildChatCompletionParams({
        baseURL: 'https://openrouter.ai/api/v1',
        userConfig: { reasoningEnabled: 'default' },
      }).config,
    ).toEqual({ temperature: undefined });
  });

  it.each([
    {
      reasoningEnabled: undefined,
      expected: { thinking: { type: 'disabled' } },
    },
    { reasoningEnabled: false, expected: { thinking: { type: 'disabled' } } },
    {
      reasoningEnabled: true,
      expected: { thinking: { type: 'enabled' }, reasoning_effort: 'max' },
    },
    { reasoningEnabled: 'default', expected: {} },
  ] as const)(
    'maps native enabled=$reasoningEnabled and effort without budget',
    ({ reasoningEnabled, expected }) => {
      expect(
        kimi3Adapter.chatCompletion.buildChatCompletionParams({
          baseURL: 'https://api.moonshot.cn/v1',
          userConfig: {
            reasoningEnabled,
            reasoningEffort: 'max',
            reasoningBudget: 1024,
          },
        }).config,
      ).toEqual({ temperature: undefined, ...expected });
    },
  );

  it('omits native thinking configuration for default without effort', () => {
    expect(
      kimi3Adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { reasoningEnabled: 'default' },
      }).config,
    ).toEqual({ temperature: undefined });
  });

  it('replays the raw assistant message for multi-turn reasoning', () => {
    expect(kimi3Adapter.chatCompletion.replayRawAssistantMessage).toBe(true);
    expect(kimiAdapter.chatCompletion.replayRawAssistantMessage).toBe(false);
  });

  it('disables native K3 thinking when unset', () => {
    const result = kimi3Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });

    expect(result.config).toEqual({
      temperature: undefined,
      thinking: { type: 'disabled' },
    });
  });

  it('maps reasoning effort to the Kimi 3 top-level config', () => {
    const result = kimi3Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: { reasoningEffort: 'max', reasoningEnabled: true },
    });

    expect(result.config).toEqual({
      temperature: undefined,
      reasoning_effort: 'max',
      thinking: { type: 'enabled' },
    });
  });
});
