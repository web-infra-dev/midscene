import {
  doubaoAdapters,
  normalizeDoubaoJsonObject,
  parseDoubaoRawLocateValue,
  preprocessDoubaoLocateJson,
  shouldRepairDoubaoLocateJson,
} from '@/ai-model/models/doubao';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { describe, expect, it } from 'vitest';

const doubaoVisionAdapter = new ResolvedModelAdapter(
  doubaoAdapters['doubao-vision'],
  'doubao-vision',
);
const doubaoSeedAdapter = new ResolvedModelAdapter(
  doubaoAdapters['doubao-seed'],
  'doubao-seed',
);

describe('doubao model adapter', () => {
  it('keeps doubao-seed and doubao-vision json parsing behavior aligned', () => {
    expect(doubaoSeedAdapter.jsonParser).toBe(doubaoVisionAdapter.jsonParser);
    expect(doubaoSeedAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningBudget',
    ]);
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

  it('repairs bbox coordinate strings for locate-like json parser sources', () => {
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
  ],
  "errors": []
}
    `;
    expect(parser(input, context)).toEqual({
      bbox: ['550 216', '550 216', '550 216', '550 216'],
      errors: [],
    });
  });

  it('normalizes Doubao repaired json objects recursively', () => {
    expect(
      normalizeDoubaoJsonObject(
        {
          ' value ': '  keep spaces  ',
          ' nested ': {
            ' prompt ': '  submit  ',
          },
          ' list ': [{ ' item ': '  first  ' }],
          nil: null,
        },
        { preserveStringValueKeys: ['value'] },
      ),
    ).toEqual({
      value: '  keep spaces  ',
      nested: {
        prompt: 'submit',
      },
      list: [{ item: 'first' }],
      nil: null,
    });
    expect(normalizeDoubaoJsonObject('  text  ')).toBe('text');
    expect(normalizeDoubaoJsonObject(undefined)).toBeUndefined();
  });

  it('detects Doubao json parser sources that need locate repair', () => {
    expect(shouldRepairDoubaoLocateJson('locate')).toBe(true);
    expect(shouldRepairDoubaoLocateJson('section-locator')).toBe(true);
    expect(shouldRepairDoubaoLocateJson('planning-action-param')).toBe(true);
    expect(shouldRepairDoubaoLocateJson('generic-object')).toBe(false);
  });

  it('preprocesses Doubao locate json only when bbox text is present', () => {
    expect(preprocessDoubaoLocateJson('{"bbox": [940 445 969 490]}')).toBe(
      '{"bbox": [940,445,969,490]}',
    );
    expect(preprocessDoubaoLocateJson('{"point": [940 445]}')).toBe(
      '{"point": [940 445]}',
    );
  });

  it('does not repair malformed json for generic parser sources', () => {
    const parser = doubaoVisionAdapter.jsonParser;

    expect(() => parser('```', { source: 'generic-object' })).toThrow();
  });

  it('normalizes repaired doubao json while preserving configured string values', () => {
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

  it('normalizes doubao bbox coordinates', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 200, 300, 400],
        { preparedSize: { width: 1000, height: 2000 } },
      );
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        400,
        300,
        800,
      ]
    `);
  });

  it('normalizes doubao space-separated bbox string coordinates', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    expect(
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        '100 200 300 400',
        { preparedSize: { width: 1000, height: 2000 } },
      ),
    ).toEqual([100, 400, 300, 800]);
  });

  it('parses raw Doubao locate values directly', () => {
    expect(parseDoubaoRawLocateValue('100 200 300 400')).toEqual({
      type: 'bbox',
      coordinates: [100, 200, 300, 400],
    });
    expect(parseDoubaoRawLocateValue(['100', '200', '300', '400'])).toEqual({
      type: 'bbox',
      coordinates: [100, 200, 300, 400],
    });
    expect(() => parseDoubaoRawLocateValue('100 200 300 400 ')).toThrow(
      /invalid bbox data string/,
    );
    expect(() => parseDoubaoRawLocateValue('100 200 300')).toThrow(
      /invalid bbox data string/,
    );
  });

  it('normalizes doubao five-number bbox by using the first four values', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    expect(
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 200, 300, 400, 999],
        { preparedSize: { width: 1000, height: 2000 } },
      ),
    ).toEqual([100, 400, 300, 800]);
  });

  it('normalizes doubao three-number point fallback', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    expect(
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 200, 300],
        { preparedSize: { width: 1000, height: 2000 } },
      ),
    ).toEqual([90, 380, 110, 420]);
  });

  it('normalizes doubao point fallback', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 200],
        { preparedSize: { width: 1000, height: 2000 } },
      );
    expect(result).toMatchInlineSnapshot(`
      [
        90,
        380,
        110,
        420,
      ]
    `);
  });

  it('normalizes doubao bbox with space-separated point strings', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        ['123 100', '789 222'],
        { preparedSize: { width: 1000, height: 2000 } },
      );
    expect(result).toMatchInlineSnapshot(`
      [
        123,
        200,
        788,
        444,
      ]
    `);
  });

  it('normalizes doubao bbox with comma-separated point strings', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        ['123,100', '789, 222'],
        { preparedSize: { width: 1000, height: 2000 } },
      );
    expect(result).toMatchInlineSnapshot(`
      [
        123,
        200,
        788,
        444,
      ]
    `);
  });

  it('flattens single nested doubao bbox', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [[100, 200, 300, 400]],
        { preparedSize: { width: 400, height: 900 } },
      );
    expect(result).toMatchInlineSnapshot(`
      [
        40,
        180,
        120,
        360,
      ]
    `);
  });

  it('flattens nested doubao bbox list by taking the first entry', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [
          [100, 200, 300, 400],
          [100, 200, 300, 400],
        ],
        { preparedSize: { width: 400, height: 900 } },
      );
    expect(result).toMatchInlineSnapshot(`
      [
        40,
        180,
        120,
        360,
      ]
    `);
  });

  it('normalizes doubao malformed six-number point fallback', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 200, 300, 400, 100, 200],
        { preparedSize: { width: 1000, height: 2000 } },
      );
    expect(result).toMatchInlineSnapshot(`
      [
        90,
        380,
        110,
        420,
      ]
    `);
  });

  it('normalizes doubao polygon bbox', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    const result =
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox(
        [100, 200, 300, 200, 300, 400, 100, 400],
        { preparedSize: { width: 1000, height: 2000 } },
      );
    expect(result).toMatchInlineSnapshot(`
      [
        100,
        400,
        300,
        800,
      ]
    `);
  });

  it('throws on invalid doubao bbox data', () => {
    const locateAdapter = doubaoVisionAdapter.locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('doubao-vision should use standard locate adapter');
    }

    expect(() =>
      locateAdapter.resultAdapter.adaptElementLocateResultToPixelBbox([100], {
        preparedSize: { width: 1000, height: 2000 },
      }),
    ).toThrow();
  });
});
