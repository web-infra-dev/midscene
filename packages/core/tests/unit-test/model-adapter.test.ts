import {
  getModelAdapter,
  getStandardLocateResultAdapter,
} from '@/ai-model/models';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { MODEL_FAMILY_VALUES } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

describe('model adapter registry', () => {
  it('resolves the default adapter when modelFamily is not configured', () => {
    const adapter = getModelAdapter();

    expect(adapter.planning.cacheEnabled).toBe(true);
    expect(adapter.planning.defaultReplanningCycleLimit).toBe(20);
  });

  it('resolves every supported model family', () => {
    for (const modelFamily of MODEL_FAMILY_VALUES) {
      const adapter = getModelAdapter(modelFamily);

      expect(adapter.jsonParser).toBeTruthy();
      expect(adapter.chatCompletion.buildChatCompletionParams).toBeTruthy();
      expect(adapter.imagePreprocess).toBeTruthy();
      if (adapter.planning.kind === 'custom') {
        expect(adapter.planning.planFn).toBeTruthy();
      }
      if (adapter.locate.kind === 'standard') {
        expect(adapter.locate.resultAdapter.responseFormat).toBeTruthy();
        expect(adapter.locate.resultAdapter.resolveLocateResult).toBeTruthy();
        expect(
          adapter.locate.resultAdapter.normalizeResultToPixelBbox,
        ).toBeTruthy();
      } else {
        expect(adapter.locate.locateFn).toBeTruthy();
      }
    }
  });

  it('keeps equivalent model family behavior aligned', () => {
    expect(getModelAdapter('doubao-seed').jsonParser).toBe(
      getModelAdapter('doubao-vision').jsonParser,
    );
    expect(
      getModelAdapter('qwen3.6').chatCompletion.buildChatCompletionParams({
        reasoningEnabled: true,
        reasoningBudget: 1024,
      }),
    ).toEqual(
      getModelAdapter('qwen3.5').chatCompletion.buildChatCompletionParams({
        reasoningEnabled: true,
        reasoningBudget: 1024,
      }),
    );
    expect(getModelAdapter('vlm-ui-tars-doubao')).not.toBe(
      getModelAdapter('vlm-ui-tars'),
    );
    expect(
      getModelAdapter('vlm-ui-tars-doubao').planning
        .defaultReplanningCycleLimit,
    ).toBe(
      getModelAdapter('vlm-ui-tars-doubao-1.5').planning
        .defaultReplanningCycleLimit,
    );
  });

  it('keeps UI-TARS planning variants in the adapter', () => {
    const uiTarsPlanning = getModelAdapter('vlm-ui-tars').planning;
    const doubaoPlanning = getModelAdapter('vlm-ui-tars-doubao').planning;
    const doubao15Planning = getModelAdapter('vlm-ui-tars-doubao-1.5').planning;
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

  it('keeps model-specific image preprocess policy in the adapter', () => {
    expect(getModelAdapter('qwen2.5-vl').imagePreprocess).toEqual({
      padBlockSize: 28,
    });
    expect(getModelAdapter('qwen3-vl').imagePreprocess).toEqual({});
    expect(getModelAdapter('gpt-5').imagePreprocess).toEqual({});
  });

  it('keeps Auto-GLM prompt selectors in the adapter', () => {
    const autoGlmPlanning = getModelAdapter('auto-glm').planning;
    const multilingualPlanning = getModelAdapter(
      'auto-glm-multilingual',
    ).planning;
    expect(autoGlmPlanning.kind).toBe('custom');
    expect(multilingualPlanning.kind).toBe('custom');
    expect(getModelAdapter('auto-glm').locate.kind).toBe('custom');
    expect(getModelAdapter('auto-glm-multilingual').locate.kind).toBe('custom');
    if (
      autoGlmPlanning.kind !== 'custom' ||
      multilingualPlanning.kind !== 'custom'
    ) {
      throw new Error('Auto-GLM should use custom planning adapter');
    }
    expect(autoGlmPlanning.planFn).not.toBe(multilingualPlanning.planFn);
    expect(getModelAdapter('auto-glm').locate).not.toBe(
      getModelAdapter('auto-glm-multilingual').locate,
    );
  });

  it('keeps Gemini bbox prompt in yxyx order', () => {
    const locateAdapter = getModelAdapter('gemini').locate;
    expect(locateAdapter.kind).toBe('standard');
    if (locateAdapter.kind !== 'standard') {
      throw new Error('gemini should use standard locate adapter');
    }
    expect(locateAdapter.resultAdapter.responseFormat).toMatchObject({
      coordinateOrder: 'yxyx',
      coordinateSystem: 'normalized-0-1000',
      resultType: 'bbox',
    });
  });

  it('keeps UI-TARS planning defaults in the adapter', () => {
    const adapter = getModelAdapter('vlm-ui-tars');

    expect(adapter.planning.kind).toBe('custom');
    expect(adapter.planning.cacheEnabled).toBe(false);
    expect(adapter.planning.defaultReplanningCycleLimit).toBe(40);
  });

  it('keeps Auto-GLM planning defaults in the adapter', () => {
    const adapter = getModelAdapter('auto-glm');

    expect(adapter.planning.kind).toBe('custom');
    expect(adapter.locate.kind).toBe('custom');
    expect(adapter.planning.cacheEnabled).toBe(false);
    expect(adapter.planning.defaultReplanningCycleLimit).toBe(100);
  });

  it('keeps GPT-5 temperature and image-detail policy in the adapter', () => {
    const adapter = getModelAdapter('gpt-5');

    expect(
      adapter.chatCompletion.buildChatCompletionParams({ temperature: 0 })
        .config.temperature,
    ).toBeUndefined();
    expect(
      adapter.chatCompletion.buildChatCompletionParams({ temperature: 0.7 })
        .config.temperature,
    ).toBeUndefined();
    expect(
      adapter.chatCompletion.buildChatCompletionParams({ temperature: 0.7 })
        .lockedParams,
    ).toContain('temperature');
    expect(
      adapter.chatCompletion.resolveImageDetail({ intent: 'default' }),
    ).toBe('original');
    expect(
      adapter.chatCompletion.resolveImageDetail({ intent: 'planning' }),
    ).toBeUndefined();
  });

  it('guards standard locate result adapter access', () => {
    expect(() => getStandardLocateResultAdapter()).toThrow(
      /Model family is required for locate/,
    );
    expect(() => getStandardLocateResultAdapter('auto-glm')).toThrow(
      /does not use standard locate result adapter/,
    );
  });
});

describe('ResolvedModelAdapter', () => {
  it('applies default adapter behavior for omitted definition fields', () => {
    const adapter = new ResolvedModelAdapter();

    expect(adapter.jsonParser('{"foo": "bar"}')).toEqual({ foo: 'bar' });
    expect(adapter.chatCompletion.buildChatCompletionParams({})).toEqual({
      config: {},
    });
    expect(adapter.chatCompletion.resolveImageDetail({})).toBeUndefined();
    expect(adapter.imagePreprocess).toEqual({});
    expect(adapter.planning).toMatchObject({
      kind: 'standard',
      cacheEnabled: true,
      defaultReplanningCycleLimit: 20,
    });
    expect(adapter.locate.kind).toBe('standard');
    if (adapter.locate.kind !== 'standard') {
      throw new Error('default adapter should use standard locate');
    }
    expect(adapter.locate.supportsSearchArea).toBe(true);
    expect(adapter.locate.resultAdapter.responseFormat).toMatchObject({
      resultType: 'bbox',
      coordinateSystem: 'normalized-0-1000',
      coordinateOrder: 'xyxy',
    });
  });

  it('keeps custom planning and locate definitions while applying policy defaults', () => {
    const planFn = vi.fn();
    const locateFn = vi.fn();
    const adapter = new ResolvedModelAdapter({
      planning: {
        kind: 'custom',
        planFn,
      },
      locate: {
        kind: 'custom',
        locateFn,
      },
    });

    expect(adapter.planning).toMatchObject({
      kind: 'custom',
      cacheEnabled: true,
      defaultReplanningCycleLimit: 20,
    });
    expect(adapter.locate).toMatchObject({
      kind: 'custom',
      supportsSearchArea: false,
    });
    if (
      adapter.planning.kind !== 'custom' ||
      adapter.locate.kind !== 'custom'
    ) {
      throw new Error('adapter should keep custom handlers');
    }
    expect(adapter.planning.planFn).toBe(planFn);
    expect(adapter.locate.locateFn).toBe(locateFn);
  });
});
