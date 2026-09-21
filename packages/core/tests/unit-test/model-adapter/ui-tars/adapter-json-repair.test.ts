import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { uiTarsAdapters } from '@/ai-model/models/ui-tars/adapter';
import { describe, expect, it } from '@rstest/core';

const uiTarsAdapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars'],
  'vlm-ui-tars',
);

describe('ui-tars json parser', () => {
  it('repairs bbox whitespace for locate results', () => {
    expect(
      uiTarsAdapter.jsonParser('{"bbox": [123 456 789 100]}', {
        source: 'locate',
      }),
    ).toEqual({
      bbox: [123, 456, 789, 100],
    });
  });

  it('uses the unified parser for generic object responses', () => {
    expect(uiTarsAdapter.jsonParser('{"bbox": [123 456 789 100]}')).toEqual({
      bbox: [123, 456, 789, 100],
    });
  });
});
