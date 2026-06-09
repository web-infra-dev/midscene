import { qwenAdapters } from '@/ai-model/models/qwen';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { describe, expect, it } from 'vitest';

const qwen25Adapter = new ResolvedModelAdapter(
  qwenAdapters['qwen2.5-vl'],
  'qwen2.5-vl',
);
const qwen3VlAdapter = new ResolvedModelAdapter(
  qwenAdapters['qwen3-vl'],
  'qwen3-vl',
);
const qwen3Adapter = new ResolvedModelAdapter(qwenAdapters.qwen3, 'qwen3');
const qwen35Adapter = new ResolvedModelAdapter(
  qwenAdapters['qwen3.5'],
  'qwen3.5',
);
const qwen36Adapter = new ResolvedModelAdapter(
  qwenAdapters['qwen3.6'],
  'qwen3.6',
);

describe('qwen model adapter', () => {
  it('keeps qwen3, qwen3.5 and qwen3.6 chat completion behavior aligned', () => {
    expect(
      qwen36Adapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEnabled: true,
          reasoningBudget: 1024,
        },
      }),
    ).toEqual(
      qwen35Adapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEnabled: true,
          reasoningBudget: 1024,
        },
      }),
    );
    expect(
      qwen3Adapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEnabled: true,
          reasoningBudget: 1024,
        },
      }),
    ).toEqual(
      qwen35Adapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEnabled: true,
          reasoningBudget: 1024,
        },
      }),
    );
  });

  it('keeps model-specific image preprocess policy in the adapter', () => {
    expect(qwen25Adapter.imagePreprocess).toEqual({
      padBlockSize: 28,
    });
    expect(qwen3VlAdapter.imagePreprocess).toEqual({});
    expect(qwen25Adapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEnabled',
      'reasoningEffort',
      'reasoningBudget',
    ]);
    expect(qwen3VlAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEffort',
    ]);
    expect(qwen3Adapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEffort',
    ]);
  });

  it('keeps qwen2.5-vl high-resolution image request flag without reasoning params', () => {
    const result = qwen25Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });
    expect(result.config).toEqual({
      temperature: 0,
      vl_high_resolution_images: true,
    });
  });

  it('preserves midscene defaults and applies explicit qwen temperature override', () => {
    const chatCompletion = qwenAdapters['qwen3-vl'].chatCompletion;
    expect(chatCompletion).toBeDefined();
    if (!chatCompletion) {
      throw new Error('qwen3-vl should define chat completion adapter');
    }
    const buildChatCompletionParams = chatCompletion.buildChatCompletionParams;
    expect(buildChatCompletionParams).toBeDefined();
    if (!buildChatCompletionParams) {
      throw new Error('qwen3-vl should define chat completion params builder');
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
      enable_thinking: true,
    });
  });

  it('keeps qwen2.5-vl default temperature when user temperature is undefined', () => {
    const chatCompletion = qwenAdapters['qwen2.5-vl'].chatCompletion;
    expect(chatCompletion).toBeDefined();
    if (!chatCompletion) {
      throw new Error('qwen2.5-vl should define chat completion adapter');
    }
    const buildChatCompletionParams = chatCompletion.buildChatCompletionParams;
    expect(buildChatCompletionParams).toBeDefined();
    if (!buildChatCompletionParams) {
      throw new Error(
        'qwen2.5-vl should define chat completion params builder',
      );
    }

    const result = buildChatCompletionParams({
      midsceneDefaults: {
        temperature: 0.2,
        seed: 456,
      } as any,
      userConfig: {
        temperature: undefined,
      },
    });

    expect(result.config).toEqual({
      temperature: 0.2,
      seed: 456,
      vl_high_resolution_images: true,
    });
  });

  it('applies explicit qwen2.5-vl temperature override', () => {
    const chatCompletion = qwenAdapters['qwen2.5-vl'].chatCompletion;
    expect(chatCompletion).toBeDefined();
    if (!chatCompletion) {
      throw new Error('qwen2.5-vl should define chat completion adapter');
    }
    const buildChatCompletionParams = chatCompletion.buildChatCompletionParams;
    expect(buildChatCompletionParams).toBeDefined();
    if (!buildChatCompletionParams) {
      throw new Error(
        'qwen2.5-vl should define chat completion params builder',
      );
    }

    const result = buildChatCompletionParams({
      midsceneDefaults: {
        temperature: 0.2,
        seed: 456,
      } as any,
      userConfig: {
        temperature: 0.7,
      },
    });

    expect(result.config).toEqual({
      temperature: 0.7,
      seed: 456,
      vl_high_resolution_images: true,
    });
  });

  it('keeps qwen2.5-vl high-resolution flag while ignoring reasoning params', () => {
    const result = qwen25Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningBudget: 500,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      vl_high_resolution_images: true,
    });
  });

  it('defaults qwen3-vl thinking to disabled when reasoning config is unset', () => {
    const result = qwen3VlAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });
    expect(result.config).toEqual({
      temperature: 0,
      enable_thinking: false,
    });
  });

  it('maps reasoningEnabled to enable_thinking for qwen3-vl with default budget', () => {
    const result = qwen3VlAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      enable_thinking: true,
    });
  });

  it('maps reasoningEnabled=false to enable_thinking=false for qwen3.5', () => {
    const result = qwen35Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: false,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      enable_thinking: false,
    });
  });

  it('maps reasoningEnabled=false to enable_thinking=false for qwen3', () => {
    const result = qwen3Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: false,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      enable_thinking: false,
    });
  });

  it('maps reasoningBudget to thinking_budget for qwen3.6', () => {
    const result = qwen36Adapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningBudget: 500,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      enable_thinking: true,
      thinking_budget: 500,
    });
  });

  it('maps reasoningBudget to thinking_budget for qwen3-vl', () => {
    const result = qwen3VlAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningBudget: 16384,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      enable_thinking: true,
      thinking_budget: 16384,
    });
  });

  it('ignores reasoningEffort for qwen because it is not a supported param', () => {
    const result = qwen3VlAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEffort: 'high',
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      enable_thinking: false,
    });
  });

  it('maps reasoningBudget alone without reasoningEnabled for qwen3-vl', () => {
    const result = qwen3VlAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningBudget: 16384,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
      enable_thinking: false,
      thinking_budget: 16384,
    });
  });

  it('normalizes actual-pixel bbox coordinates for qwen2.5-vl', () => {
    const locateAdapter = qwen25Adapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('qwen2.5-vl should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100.3, 200.4, 301, 401],
        { preparedSize: { width: 1000, height: 1000 } },
      );
    expect(result).toEqual([100, 200, 301, 401]);
  });

  it('normalizes qwen2.5-vl point fallback to a bbox', () => {
    const locateAdapter = qwen25Adapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('qwen2.5-vl should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 100],
        { preparedSize: { width: 1000, height: 1000 } },
      );
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        100,
        120,
        120,
      ]
    `);
  });

  it('throws on invalid qwen2.5-vl bbox data', () => {
    const locateAdapter = qwen25Adapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('qwen2.5-vl should use standard locate adapter');
    }

    expect(() =>
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox([100], {
        preparedSize: { width: 0, height: 0 },
      }),
    ).toThrow();
  });

  it('throws when qwen2.5-vl actual-pixel bbox exceeds image size', () => {
    const locateAdapter = qwen25Adapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('qwen2.5-vl should use standard locate adapter');
    }

    expect(() =>
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 200, 1000, 2000],
        { preparedSize: { width: 1000, height: 1000 } },
      ),
    ).toThrow(/outside the image size/);
  });
});
