import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { maiUiAdapters } from '@/ai-model/models/mai-ui/adapter';
import { describe, expect, it } from 'vitest';

const maiUiAdapter = new ResolvedModelAdapter(
  maiUiAdapters['mai-ui'],
  'mai-ui',
);

describe('mai-ui model adapter', () => {
  it('uses custom planning and custom locate from planning tap results', () => {
    expect(maiUiAdapter.planning.kind).toBe('custom');
    expect(maiUiAdapter.locate.kind).toBe('custom');
    expect(maiUiAdapter.planning.cacheEnabled).toBe(false);
    expect(maiUiAdapter.planning.defaultReplanningCycleLimit).toBe(20);
    expect(maiUiAdapter.planning.supportsActionDeepLocate).toBe(false);
    expect(maiUiAdapter.locate.supportsSearchArea).toBe(false);

    if (maiUiAdapter.planning.kind !== 'custom') {
      throw new Error('MAI-UI should use custom planning adapter');
    }

    expect(maiUiAdapter.planning.coordinateSystem).toEqual({
      shape: 'point',
      order: 'xy',
      normalizedBy: 999,
    });
  });

  it('keeps MAI-UI request params without reasoning config', () => {
    const result = maiUiAdapter.chatCompletion.buildChatCompletionParams({
      userConfig: {},
    });

    expect(maiUiAdapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEnabled',
      'reasoningEffort',
      'reasoningBudget',
    ]);
    expect(result.config).toEqual({
      temperature: 0,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      seed: 42,
      extra_body: {
        repetition_penalty: 1.0,
        top_k: -1,
      },
    });
  });

  it('preserves midscene defaults and applies explicit MAI-UI temperature override', () => {
    const chatCompletion = maiUiAdapters['mai-ui'].chatCompletion;
    expect(chatCompletion).toBeDefined();
    if (!chatCompletion?.buildChatCompletionParams) {
      throw new Error('MAI-UI should define chat completion params builder');
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
      seed: 42,
      top_p: 1.0,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      extra_body: {
        repetition_penalty: 1.0,
        top_k: -1,
      },
    });
  });
});
