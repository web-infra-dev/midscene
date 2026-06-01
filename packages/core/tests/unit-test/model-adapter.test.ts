import { getModelAdapter } from '@/ai-model/models';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { MODEL_FAMILY_VALUES } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

describe('model adapter registry', () => {
  it('resolves the default adapter when modelFamily is not configured', () => {
    const adapter = getModelAdapter();

    expect(adapter.planning.cacheEnabled).toBe(true);
    expect(adapter.planning.defaultReplanningCycleLimit).toBe(20);
    expect(adapter.planning.supportsActionDeepLocate).toBe(true);
    expect(adapter.chatCompletion.unsupportedUserConfig).toEqual([
      'reasoningEnabled',
      'reasoningEffort',
      'reasoningBudget',
    ]);
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
        expect(adapter.locate.resultAdapter.promptSpec).toBeTruthy();
        expect(
          adapter.locate.resultAdapter.adaptElementLocateResultToPixelBbox,
        ).toBeTruthy();
        expect(
          adapter.locate.resultAdapter.adaptSectionLocateResultToPixelBboxGroup,
        ).toBeTruthy();
        expect(
          adapter.locate.resultAdapter.adaptPlanningParamToPixelBbox,
        ).toBeTruthy();
      } else {
        expect(adapter.locate.locateFn).toBeTruthy();
      }
    }
  });
});

describe('ResolvedModelAdapter', () => {
  it('applies default adapter behavior for omitted definition fields', () => {
    const adapter = new ResolvedModelAdapter({}, 'test-default');

    expect(
      adapter.jsonParser('{"foo": "bar"}', { source: 'generic-object' }),
    ).toEqual({ foo: 'bar' });
    expect(adapter.chatCompletion.buildChatCompletionParams({})).toEqual({
      config: { temperature: 0 },
    });
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        userConfig: { temperature: 0.7 },
      }),
    ).toEqual({
      config: { temperature: 0.7 },
    });
    expect(adapter.chatCompletion.resolveImageDetail({})).toBeUndefined();
    expect(adapter.imagePreprocess).toEqual({});
    expect(adapter.planning).toMatchObject({
      kind: 'standard',
      cacheEnabled: true,
      defaultReplanningCycleLimit: 20,
      supportsActionDeepLocate: true,
    });
    expect(adapter.locate.kind).toBe('standard');
    if (adapter.locate.kind !== 'standard') {
      throw new Error('default adapter should use standard locate');
    }
    expect(adapter.locate.supportsSearchArea).toBe(true);
    expect(adapter.locate.resultAdapter.kind).toBe('standard');
    if (adapter.locate.resultAdapter.kind !== 'standard') {
      throw new Error('default result adapter should be standard');
    }
    expect(
      adapter.locate.resultAdapter.promptSpec.resultValueDescription,
    ).toContain('normalized to 0-1000');
  });

  it('keeps custom planning and locate definitions while applying policy defaults', () => {
    const planFn = vi.fn();
    const locateFn = vi.fn();
    const adapter = new ResolvedModelAdapter(
      {
        planning: {
          kind: 'custom',
          planFn,
        },
        locate: {
          kind: 'custom',
          locateFn,
        },
      },
      'test-custom',
    );

    expect(adapter.planning).toMatchObject({
      kind: 'custom',
      cacheEnabled: true,
      defaultReplanningCycleLimit: 20,
      supportsActionDeepLocate: false,
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

  it('allows adapters to opt custom planning into action deepLocate', () => {
    const planFn = vi.fn();
    const adapter = new ResolvedModelAdapter(
      {
        planning: {
          kind: 'custom',
          planFn,
          supportsActionDeepLocate: true,
        },
      },
      'test-custom-planning',
    );

    expect(adapter.planning.supportsActionDeepLocate).toBe(true);
  });

  it('allows adapters to opt custom locate into search area', () => {
    const locateFn = vi.fn();
    const adapter = new ResolvedModelAdapter(
      {
        locate: {
          kind: 'custom',
          locateFn,
          supportsSearchArea: true,
        },
      },
      'test-custom-locate',
    );

    expect(adapter.locate.supportsSearchArea).toBe(true);
  });
});
