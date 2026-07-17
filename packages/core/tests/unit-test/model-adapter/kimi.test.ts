import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { kimiAdapters } from '@/ai-model/models/kimi';
import { describe, expect, it } from 'vitest';

const kimiAdapter = new ResolvedModelAdapter(kimiAdapters.kimi, 'kimi');
const kimi3Adapter = new ResolvedModelAdapter(kimiAdapters.kimi3, 'kimi3');

describe('kimi model adapter', () => {
  it('uses 0-1 normalized xy point coordinates for kimi locate results', () => {
    const locateAdapter = kimiAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('kimi should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [0.371, 0.109],
        { preparedSize: { width: 1920, height: 1440 } },
      );
    expect(result).toEqual([693, 142, 731, 171]);
  });

  it('accepts pixel xy point coordinates for kimi locate results', () => {
    const locateAdapter = kimiAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('kimi should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [960, 540],
        { preparedSize: { width: 1920, height: 1080 } },
      );
    expect(result).toEqual([950, 530, 970, 550]);
  });

  it('accepts pixel xy point strings for kimi locate results', () => {
    const locateAdapter = kimiAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('kimi should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        '960 540',
        { preparedSize: { width: 1920, height: 1080 } },
      );
    expect(result).toEqual([950, 530, 970, 550]);
  });

  it('rejects out-of-range kimi pixel point coordinates', () => {
    const locateAdapter = kimiAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('kimi should use standard locate adapter');
    }

    expect(() =>
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [2000, 540],
        { preparedSize: { width: 1920, height: 1080 } },
      ),
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

    expect(kimiAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEffort',
      'reasoningBudget',
    ]);
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
  it('replays the raw assistant message for multi-turn reasoning', () => {
    expect(kimi3Adapter.chatCompletion.replayRawAssistantMessage).toBe(true);
    expect(kimiAdapter.chatCompletion.replayRawAssistantMessage).toBe(false);
  });

  it('does not send reasoning or thinking config when unset', () => {
    const result = kimi3Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });

    expect(result.config).toEqual({
      temperature: undefined,
    });
  });

  it('maps reasoning effort to the Kimi 3 top-level config', () => {
    const result = kimi3Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: { reasoningEffort: 'max', reasoningEnabled: false },
    });

    expect(kimi3Adapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEnabled',
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: undefined,
      reasoning_effort: 'max',
    });
  });
});
