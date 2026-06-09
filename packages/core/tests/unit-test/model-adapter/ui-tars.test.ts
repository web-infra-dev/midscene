import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { uiTarsAdapters } from '@/ai-model/models/ui-tars/adapter';
import { describe, expect, it } from 'vitest';

const uiTarsAdapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars'],
  'vlm-ui-tars',
);
const doubaoAdapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars-doubao'],
  'vlm-ui-tars-doubao',
);
const doubao15Adapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars-doubao-1.5'],
  'vlm-ui-tars-doubao-1.5',
);

function getUiTarsLocateResultAdapter() {
  const locateAdapter = uiTarsAdapter.locate;
  expect(locateAdapter.kind).toBe('standard');
  if (locateAdapter.kind !== 'standard') {
    throw new Error('UI-TARS should use standard locate adapter');
  }
  return locateAdapter.resultAdapter;
}

describe('ui-tars model adapter', () => {
  it('keeps UI-TARS planning variants in the adapter', () => {
    const uiTarsPlanning = uiTarsAdapter.planning;
    const doubaoPlanning = doubaoAdapter.planning;
    const doubao15Planning = doubao15Adapter.planning;
    expect(uiTarsPlanning.kind).toBe('custom');
    expect(doubaoPlanning.kind).toBe('custom');
    expect(doubao15Planning.kind).toBe('custom');
    if (
      uiTarsPlanning.kind !== 'custom' ||
      doubaoPlanning.kind !== 'custom' ||
      doubao15Planning.kind !== 'custom'
    ) {
      throw new Error('UI-TARS should use custom planning adapter');
    }
    expect(uiTarsPlanning.planFn).not.toBe(doubaoPlanning.planFn);
    expect(doubaoPlanning.planFn).toBe(doubao15Planning.planFn);
  });

  it('keeps equivalent UI-TARS family behavior aligned', () => {
    expect(doubaoAdapter).not.toBe(uiTarsAdapter);
    expect(doubaoAdapter.planning.defaultReplanningCycleLimit).toBe(
      doubao15Adapter.planning.defaultReplanningCycleLimit,
    );
  });

  it('keeps UI-TARS planning defaults in the adapter', () => {
    expect(uiTarsAdapter.planning.kind).toBe('custom');
    expect(uiTarsAdapter.planning.cacheEnabled).toBe(false);
    expect(uiTarsAdapter.planning.defaultReplanningCycleLimit).toBe(40);
    expect(uiTarsAdapter.planning.supportsActionDeepLocate).toBe(false);
  });

  it('preserves midscene defaults and applies explicit UI-TARS temperature override', () => {
    const chatCompletion = uiTarsAdapters['vlm-ui-tars'].chatCompletion;
    expect(chatCompletion).toBeDefined();
    if (!chatCompletion) {
      throw new Error('UI-TARS should define chat completion adapter');
    }
    const buildChatCompletionParams = chatCompletion.buildChatCompletionParams;
    expect(buildChatCompletionParams).toBeDefined();
    if (!buildChatCompletionParams) {
      throw new Error('UI-TARS should define chat completion params builder');
    }

    const result = buildChatCompletionParams({
      midsceneDefaults: {
        temperature: 0,
        seed: 123,
      } as any,
      userConfig: {
        temperature: 0.7,
      },
    });

    expect(result.config).toEqual({
      temperature: 0.7,
      seed: 123,
    });
  });

  it('repairs bbox coordinate strings for locate-like json parser sources', () => {
    const parser = uiTarsAdapter.jsonParser;

    expect(parser('{"bbox": [123 456]}', { source: 'locate' })).toEqual({
      bbox: [123, 456],
    });
    expect(
      parser('{"locate": {"bbox": [123 456 789 100]}}', {
        source: 'planning-action-param',
      }),
    ).toEqual({
      locate: { bbox: [123, 456, 789, 100] },
    });
    expect(
      parser('{"bbox": [940 445 969 490]}', {
        source: 'section-locator',
      }),
    ).toEqual({
      bbox: [940, 445, 969, 490],
    });
  });

  it('normalizes UI-TARS json while preserving configured string values', () => {
    const parser = uiTarsAdapter.jsonParser;

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

  it('normalizes UI-TARS bbox coordinate strings', () => {
    const locateResultAdapter = getUiTarsLocateResultAdapter();

    const result = locateResultAdapter.adaptElementLocateResultToPixelBbox(
      '100 200 300 400',
      { preparedSize: { width: 1000, height: 2000 } },
    );

    expect(result).toEqual([100, 400, 300, 800]);
  });

  it('normalizes UI-TARS bbox arrays with split coordinate strings', () => {
    const locateResultAdapter = getUiTarsLocateResultAdapter();

    expect(
      locateResultAdapter.adaptElementLocateResultToPixelBbox(
        ['123,100', '789 222'],
        { preparedSize: { width: 1000, height: 2000 } },
      ),
    ).toEqual([123, 200, 788, 444]);
  });

  it('normalizes UI-TARS point fallbacks from malformed bbox lists', () => {
    const locateResultAdapter = getUiTarsLocateResultAdapter();

    expect(
      locateResultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 200, 300, 400, 500, 600],
        { preparedSize: { width: 1000, height: 2000 } },
      ),
    ).toEqual([90, 380, 110, 420]);
  });

  it('normalizes UI-TARS polygon bbox coordinates', () => {
    const locateResultAdapter = getUiTarsLocateResultAdapter();

    expect(
      locateResultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 200, 300, 200, 300, 400, 100, 400],
        { preparedSize: { width: 1000, height: 2000 } },
      ),
    ).toEqual([100, 400, 300, 800]);
  });

  it('throws on invalid UI-TARS bbox data', () => {
    const locateResultAdapter = getUiTarsLocateResultAdapter();

    expect(() =>
      locateResultAdapter.adaptElementLocateResultToPixelBbox([100], {
        preparedSize: { width: 1000, height: 2000 },
      }),
    ).toThrow(/invalid bbox data/);
  });
});
