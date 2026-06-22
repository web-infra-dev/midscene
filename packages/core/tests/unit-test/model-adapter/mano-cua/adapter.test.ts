import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { manoCuaAdapters } from '@/ai-model/models/mano-cua/adapter';
import { describe, expect, it } from 'vitest';

const manoCuaAdapter = new ResolvedModelAdapter(
  manoCuaAdapters['mano-cua'],
  'mano-cua',
);

describe('mano-cua model adapter', () => {
  it('uses custom planning and custom locate from planning tap results', () => {
    expect(manoCuaAdapter.planning.kind).toBe('custom');
    expect(manoCuaAdapter.locate.kind).toBe('custom');
    expect(manoCuaAdapter.planning.cacheEnabled).toBe(false);
    expect(manoCuaAdapter.planning.defaultReplanningCycleLimit).toBe(20);
    expect(manoCuaAdapter.planning.supportsActionDeepLocate).toBe(false);
    expect(manoCuaAdapter.locate.supportsSearchArea).toBe(false);

    if (manoCuaAdapter.planning.kind !== 'custom') {
      throw new Error('Mano-CUA should use custom planning adapter');
    }

    expect(manoCuaAdapter.planning.coordinateSystem).toEqual({
      shape: 'point',
      order: 'xy',
      normalizedBy: 1000,
    });
  });

  it('keeps default request params without reasoning config', () => {
    const result = manoCuaAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });

    expect(manoCuaAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEnabled',
      'reasoningEffort',
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: 0,
    });
  });

  it('preserves midscene defaults and applies explicit temperature override', () => {
    const chatCompletion = manoCuaAdapters['mano-cua'].chatCompletion;
    expect(chatCompletion?.buildChatCompletionParams).toBeDefined();
    if (!chatCompletion?.buildChatCompletionParams) {
      throw new Error('Mano-CUA should define chat completion params builder');
    }

    const result = chatCompletion.buildChatCompletionParams({
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
});
