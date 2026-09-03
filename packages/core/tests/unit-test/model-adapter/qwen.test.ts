import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { qwenAdapters } from '@/ai-model/models/qwen/adapter';
import { describe, expect, it } from '@rstest/core';

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
  it.each([
    ['qwen3', qwen3Adapter],
    ['qwen3.5', qwen35Adapter],
    ['qwen3.6', qwen36Adapter],
  ])(
    'uses point tool calls for %s element locate but keeps search-area bbox',
    (_family, adapter) => {
      const locate = adapter.locate;
      if (locate.kind !== 'standard' || !locate.searchArea) {
        throw new Error('Qwen should support standard locate and search area');
      }
      expect(locate.element.resultCodec.promptSpec.resultKey).toBe('point');
      expect(locate.element.protocol.expectedJsonObjectResponse).toBe(false);
      expect(locate.searchArea.resultCodec.promptSpec.resultKey).toBe('bbox');
      expect(locate.searchArea.protocol.expectedJsonObjectResponse).toBe(true);
      expect(
        locate.searchArea.protocol.parseRawResponse(
          '{"bbox":[100,200,300,400],"references_bbox":[[500,600,700,800]]}',
          locate.searchArea.resultCodec.promptSpec,
        ),
      ).toEqual({
        kind: 'located',
        target: [100, 200, 300, 400],
        references: [[500, 600, 700, 800]],
      });
    },
  );

  it.each([
    ['qwen2.5-vl', qwen25Adapter],
    ['qwen3-vl', qwen3VlAdapter],
  ])('accepts bbox_2d as a target alias for %s', (_modelFamily, adapter) => {
    const locateAdapter = adapter.locate;
    if (locateAdapter.kind !== 'standard') {
      throw new Error('qwen should use a standard locate protocol');
    }

    expect(
      locateAdapter.element.protocol.parseRawResponse(
        '{"bbox_2d":[100,200,300,400]}',
        locateAdapter.element.resultCodec.promptSpec,
      ),
    ).toEqual({
      kind: 'located',
      target: [100, 200, 300, 400],
    });
  });

  it('does not treat references_bbox_2d as a references alias', () => {
    const locateAdapter = qwen3VlAdapter.locate;
    if (locateAdapter.kind !== 'standard' || !locateAdapter.searchArea) {
      throw new Error('qwen3-vl should use a standard search area protocol');
    }

    expect(
      locateAdapter.searchArea.protocol.parseRawResponse(
        '{"bbox_2d":[100,200,300,400],"references_bbox_2d":[[500,600,700,800]]}',
        locateAdapter.searchArea.resultCodec.promptSpec,
      ),
    ).toEqual({
      kind: 'located',
      target: [100, 200, 300, 400],
    });
  });

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

  it('uses the Qwen planning protocol only for qwen3 and its aliases', () => {
    for (const adapter of [qwen3Adapter, qwen35Adapter, qwen36Adapter]) {
      expect(adapter.planning.kind).toBe('standard');
      if (adapter.planning.kind !== 'standard') {
        throw new Error('qwen3 should use standard planning');
      }
      expect(
        adapter.planning.protocol.actionOutputProtocol.actionOutputTagNames,
      ).toEqual(['tool_call']);
      expect(adapter.planning.locateResultCodec?.promptSpec.resultKey).toBe(
        'point',
      );
    }

    expect(qwen3VlAdapter.planning.kind).toBe('standard');
    if (qwen3VlAdapter.planning.kind !== 'standard') {
      throw new Error('qwen3-vl should use standard planning');
    }
    expect(
      qwen3VlAdapter.planning.protocol.actionOutputProtocol
        .actionOutputTagNames,
    ).toEqual(['action-type', 'action-param-json']);
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

  it('follows provider default and ignores budget for qwen when reasoningEnabled=default', () => {
    const result = qwen3VlAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: 'default',
        reasoningBudget: 16384,
      },
    });
    expect(result.config).toEqual({
      temperature: 0,
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

    const result = locateAdapter.element.resultCodec.toPixelBbox(
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

    const result = locateAdapter.element.resultCodec.toPixelBbox([100, 100], {
      preparedSize: { width: 1000, height: 1000 },
    });
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
      locateAdapter.element.resultCodec.toPixelBbox([100], {
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
      locateAdapter.element.resultCodec.toPixelBbox([100, 200, 1000, 2000], {
        preparedSize: { width: 1000, height: 1000 },
      }),
    ).toThrow(/outside the image size/);
  });
});
