import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { uiTarsAdapters } from '@/ai-model/models/ui-tars/adapter';
import { describe, expect, it } from '@rstest/core';

const uiTarsAdapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars'],
  'vlm-ui-tars',
);

function getUiTarsLocateResultCodec() {
  const locateAdapter = uiTarsAdapter.locate;
  expect(locateAdapter.kind).toBe('standard');
  if (locateAdapter.kind !== 'standard') {
    throw new Error('UI-TARS should use standard locate adapter');
  }
  return locateAdapter.element.resultCodec;
}

describe('ui-tars locate result codec', () => {
  it('normalizes UI-TARS bbox coordinate strings', () => {
    const locateResultCodec = getUiTarsLocateResultCodec();

    const result = locateResultCodec.toPixelResult('100 200 300 400', {
      preparedSize: { width: 1000, height: 2000 },
    }).rect;

    expect(result).toEqual({ left: 100, top: 400, width: 201, height: 401 });
  });

  it('normalizes UI-TARS bbox arrays with split coordinate strings', () => {
    const locateResultCodec = getUiTarsLocateResultCodec();

    expect(
      locateResultCodec.toPixelResult(['123,100', '789 222'], {
        preparedSize: { width: 1000, height: 2000 },
      }).rect,
    ).toEqual({ left: 123, top: 200, width: 667, height: 245 });
  });

  it('normalizes UI-TARS bbox arrays with numeric strings', () => {
    const locateResultCodec = getUiTarsLocateResultCodec();

    expect(
      locateResultCodec.toPixelResult(['100', '200', '300', '400'], {
        preparedSize: { width: 1000, height: 2000 },
      }).rect,
    ).toEqual({ left: 100, top: 400, width: 201, height: 401 });
  });

  it('normalizes UI-TARS point fallbacks from malformed bbox lists', () => {
    const locateResultCodec = getUiTarsLocateResultCodec();

    expect(
      locateResultCodec.toPixelResult([100, 200, 300, 400, 500, 600], {
        preparedSize: { width: 1000, height: 2000 },
      }),
    ).toEqual({ center: [100, 400] });
  });

  it('normalizes UI-TARS polygon bbox coordinates', () => {
    const locateResultCodec = getUiTarsLocateResultCodec();

    expect(
      locateResultCodec.toPixelResult(
        [100, 200, 300, 200, 300, 400, 100, 400],
        {
          preparedSize: { width: 1000, height: 2000 },
        },
      ).rect,
    ).toEqual({ left: 100, top: 400, width: 201, height: 401 });
  });

  it('throws on invalid UI-TARS bbox data', () => {
    const locateResultCodec = getUiTarsLocateResultCodec();

    expect(
      () =>
        locateResultCodec.toPixelResult([100], {
          preparedSize: { width: 1000, height: 2000 },
        }).rect,
    ).toThrow(/invalid bbox data/);
  });

  it('throws on invalid UI-TARS bbox string data', () => {
    const locateResultCodec = getUiTarsLocateResultCodec();

    expect(
      () =>
        locateResultCodec.toPixelResult('100 200 300', {
          preparedSize: { width: 1000, height: 2000 },
        }).rect,
    ).toThrow(/invalid bbox data string/);
  });
});
