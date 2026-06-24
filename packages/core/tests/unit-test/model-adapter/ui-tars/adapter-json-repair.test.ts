import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { uiTarsAdapters } from '@/ai-model/models/ui-tars/adapter';
import * as serviceCallerJsonActual from '@/ai-model/service-caller/json' with {
  rstest: 'importActual',
};
import { describe, expect, it, rs } from '@rstest/core';

rs.mock('@/ai-model/service-caller/json', () => ({
  ...serviceCallerJsonActual,
  extractJSONFromCodeBlock: rs.fn((raw: string) => raw),
  safeParseJson: rs.fn(() => {
    throw new Error('first safe parse failed');
  }),
}));

const uiTarsAdapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars'],
  'vlm-ui-tars',
);

describe('ui-tars json repair fallback', () => {
  it('repairs bbox whitespace after the first parser fails', () => {
    expect(
      uiTarsAdapter.jsonParser('{"bbox": [123 456 789 100]}', {
        source: 'locate',
      }),
    ).toEqual({
      bbox: [123, 456, 789, 100],
    });
  });

  it('rethrows the first parse error for generic parser sources', () => {
    expect(() =>
      uiTarsAdapter.jsonParser('{"bbox": [123 456 789 100]}'),
    ).toThrow('first safe parse failed');
  });
});
