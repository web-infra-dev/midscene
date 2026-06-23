import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { uiTarsAdapters } from '@/ai-model/models/ui-tars/adapter';
import { describe, expect, it } from 'vitest';

const uiTarsAdapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars'],
  'vlm-ui-tars',
);

function getUiTarsLocateResultAdapter() {
  const locateAdapter = uiTarsAdapter.locate;
  expect(locateAdapter.kind).toBe('standard');
  if (locateAdapter.kind !== 'standard') {
    throw new Error('UI-TARS should use standard locate adapter');
  }
  return locateAdapter.resultAdapter;
}

describe('ui-tars locate result adapter', () => {
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

  it('normalizes UI-TARS bbox arrays with numeric strings', () => {
    const locateResultAdapter = getUiTarsLocateResultAdapter();

    expect(
      locateResultAdapter.adaptElementLocateResultToPixelBbox(
        ['100', '200', '300', '400'],
        { preparedSize: { width: 1000, height: 2000 } },
      ),
    ).toEqual([100, 400, 300, 800]);
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

  it('throws on invalid UI-TARS bbox string data', () => {
    const locateResultAdapter = getUiTarsLocateResultAdapter();

    expect(() =>
      locateResultAdapter.adaptElementLocateResultToPixelBbox('100 200 300', {
        preparedSize: { width: 1000, height: 2000 },
      }),
    ).toThrow(/invalid bbox data string/);
  });
});
