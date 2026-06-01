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
});
