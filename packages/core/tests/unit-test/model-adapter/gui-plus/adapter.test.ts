import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { guiPlusAdapters } from '@/ai-model/models/gui-plus/adapter';
import { describe, expect, it } from 'vitest';

const guiPlusAdapter = new ResolvedModelAdapter(
  guiPlusAdapters['gui-plus-2026-02-26'],
  'gui-plus-2026-02-26',
);

describe('gui-plus-2026-02-26 model adapter', () => {
  it('uses custom planning and locate adapters', () => {
    expect(guiPlusAdapter.planning.kind).toBe('custom');
    expect(guiPlusAdapter.locate.kind).toBe('custom');
    expect(guiPlusAdapter.planning.cacheEnabled).toBe(false);
    expect(guiPlusAdapter.planning.defaultReplanningCycleLimit).toBe(20);
    expect(guiPlusAdapter.planning.supportsActionDeepLocate).toBe(false);
    expect(guiPlusAdapter.locate.supportsSearchArea).toBe(false);
  });

  it('adds GUI-Plus request defaults', () => {
    const result = guiPlusAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });

    expect(guiPlusAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEffort',
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: 0,
      vl_high_resolution_images: true,
    });
  });

  it('passes enable_thinking when reasoningEnabled is configured', () => {
    const result = guiPlusAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {
        reasoningEnabled: false,
        temperature: 0.2,
      },
    });

    expect(result.config).toEqual({
      temperature: 0.2,
      enable_thinking: false,
      vl_high_resolution_images: true,
    });
  });
});
