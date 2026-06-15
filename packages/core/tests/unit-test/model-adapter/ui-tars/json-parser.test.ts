import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { uiTarsAdapters } from '@/ai-model/models/ui-tars/adapter';
import { describe, expect, it } from 'vitest';

const uiTarsAdapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars'],
  'vlm-ui-tars',
);

describe('ui-tars json parser', () => {
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

  it('parses valid UI-TARS json without repair context', () => {
    const parser = uiTarsAdapter.jsonParser;

    expect(parser('{" action ": " click ", "count": 1}')).toEqual({
      action: 'click',
      count: 1,
    });
  });

  it('does not repair malformed json for generic parser sources', () => {
    const parser = uiTarsAdapter.jsonParser;

    expect(() => parser('{"a": truely}')).toThrow(
      /failed to parse LLM response into JSON/,
    );
  });

  it('wraps failed UI-TARS json repair errors with the raw response', () => {
    const parser = uiTarsAdapter.jsonParser;

    expect(() =>
      parser('```json\n{"bbox": truely}\n```', {
        source: 'locate',
      }),
    ).toThrow(/Response - \n ```json/);
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

  it('repairs unquoted UI-TARS bbox coordinate pairs', () => {
    const parser = uiTarsAdapter.jsonParser;

    expect(parser('{"bbox": [123 456]}', { source: 'locate' })).toEqual({
      bbox: [123, 456],
    });
  });
});
