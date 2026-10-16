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
  it('keeps doubao-seed and doubao-vision on the same adapter definition', () => {
    expect(doubaoAdapters['doubao-seed']).toBe(doubaoAdapters['doubao-vision']);
    expect(doubaoSeedAdapter.jsonParser).toBe(doubaoVisionAdapter.jsonParser);
    expect(doubaoSeedAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningBudget',
    ]);
  });

  it('uses the Seed standard planning protocol for both family aliases', () => {
    expect(doubaoSeedAdapter.planning.kind).toBe('standard');
    expect(doubaoVisionAdapter.planning.kind).toBe('standard');
    if (
      doubaoSeedAdapter.planning.kind !== 'standard' ||
      doubaoVisionAdapter.planning.kind !== 'standard'
    ) {
      throw new Error('doubao should use standard planning adapters');
    }

    expect(doubaoSeedAdapter.planning.supportsActionDeepLocate).toBe(true);
    expect(
      doubaoSeedAdapter.planning.protocol.actionOutputProtocol
        .actionOutputTagNames,
    ).toEqual(['seed:tool_call']);
    expect(
      doubaoVisionAdapter.planning.protocol.actionOutputProtocol
        .actionOutputTagNames,
    ).toEqual(['seed:tool_call']);
    expect(doubaoSeedAdapter.planning.protocol.responsePrefix).toBe(
      '<think_never_used_51bce0c785ca2f68081bfa7d91973934> reasoning process </think_never_used_51bce0c785ca2f68081bfa7d91973934>',
    );
  });

  it('uses the Seed insight protocol for both family aliases', () => {
    expect(doubaoSeedAdapter.insight.protocol.dataOutput.rules).toContain(
      '"name":"extract_data"',
    );
    expect(doubaoVisionAdapter.insight.protocol.dataOutput.rules).toContain(
      '"name":"extract_data"',
    );
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

  it('applies an explicit temperature override', () => {
    const result = doubaoSeedAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        temperature: 0.7,
        reasoningEnabled: true,
      },
    });

    expect(result.config).toEqual({
      temperature: 0.7,
      thinking: { type: 'enabled' },
    });
  });

  it('maps reasoningEnabled and reasoningEffort to Doubao parameters', () => {
    const enabled = doubaoSeedAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: true,
        reasoningEffort: 'high',
      },
    });
    const disabled =
      doubaoVisionAdapter.chatCompletion.buildChatCompletionParams({
        userConfig: { reasoningEnabled: false },
      });
    const providerDefault =
      doubaoSeedAdapter.chatCompletion.buildChatCompletionParams({
        userConfig: {
          reasoningEnabled: 'default',
          reasoningEffort: 'high',
        },
      });

    expect(enabled.config).toEqual({
      temperature: 0,
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    });
    expect(disabled.config).toEqual({
      temperature: 0,
      thinking: { type: 'disabled' },
    });
    expect(providerDefault.config).toEqual({ temperature: 0 });
  });

  it('keeps using the shared lenient JSON parser', () => {
    expect(
      doubaoVisionAdapter.jsonParser('{"point": [123 456]}', {
        source: 'locate',
      }),
    ).toEqual({ point: [123, 456] });
    expect(() =>
      doubaoVisionAdapter.jsonParser('```', { source: 'generic-object' }),
    ).toThrow();
  });

  it.each([
    ['doubao-seed', doubaoSeedAdapter],
    ['doubao-vision', doubaoVisionAdapter],
  ])('uses point/1000 coordinates for %s', (_, adapter) => {
    expect(adapter.locate.kind).toBe('standard');
    if (adapter.locate.kind !== 'standard') {
      throw new Error('doubao should use a standard locate adapter');
    }

    expect(adapter.locate.searchArea).toBeDefined();
    expect(adapter.locate.element.protocol.expectedJsonObjectResponse).toBe(
      false,
    );
    expect(adapter.locate.element.resultCodec.promptSpec.resultKey).toBe(
      'point',
    );
    expect(adapter.locate.searchArea?.resultCodec.promptSpec.resultKey).toBe(
      'point',
    );
    expect(
      adapter.locate.element.resultCodec.toPixelBbox('<point>100 200</point>', {
        preparedSize: { width: 1000, height: 2000 },
      }),
    ).toEqual([90, 380, 110, 420]);
    expect(
      adapter.locate.element.resultCodec.toPixelBbox(
        '<point>100 200</point><point>900 900</point>',
        {
          preparedSize: { width: 1000, height: 2000 },
        },
      ),
    ).toEqual([90, 380, 110, 420]);
    expect(
      adapter.locate.element.resultCodec.toPixelBbox('<point>100 200', {
        preparedSize: { width: 1000, height: 2000 },
      }),
    ).toEqual([90, 380, 110, 420]);
    expect(
      adapter.locate.element.resultCodec.toPixelBbox('100 200', {
        preparedSize: { width: 1000, height: 2000 },
      }),
    ).toEqual([90, 380, 110, 420]);
    expect(
      adapter.locate.element.resultCodec.toPixelBbox(
        '<seed:tool_call><function name="click"><parameter name="point" string="true"><point>100 200</function></seed:tool_call>',
        {
          preparedSize: { width: 1000, height: 2000 },
        },
      ),
    ).toEqual([90, 380, 110, 420]);
  });

  it('adapts a planning point to a pixel bbox', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao should use a standard locate adapter');
    }

    expect(
      locateAdapter.element.resultCodec.toPixelBbox('<point>500 500</point>', {
        preparedSize: { width: 1000, height: 1000 },
      }),
    ).toEqual([490, 490, 509, 509]);
  });

  it('rejects the retired bbox locate format', () => {
    const locateAdapter = doubaoSeedAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao should use a standard locate adapter');
    }

    expect(() =>
      locateAdapter.element.resultCodec.toPixelBbox(
        { bbox: [100, 200, 300, 400] },
        { preparedSize: { width: 1000, height: 2000 } },
      ),
    ).toThrow(/invalid point data/);
    expect(() =>
      locateAdapter.element.resultCodec.toPixelBbox([100, 200, 300, 400], {
        preparedSize: { width: 1000, height: 2000 },
      }),
    ).toThrow(/invalid point data/);
  });
});
