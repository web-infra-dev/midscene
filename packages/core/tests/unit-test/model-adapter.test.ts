import { getModelAdapter } from '@/ai-model/models';
import { MODEL_ADAPTER_CONFIGS } from '@/ai-model/models/registry';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import type { CustomPlanningDefinition } from '@/ai-model/workflows/planning/custom-planning-types';
import { MODEL_FAMILY_VALUES } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

function createTestPlannerDefinition(): CustomPlanningDefinition<null> {
  return {
    messages: {
      systemPromptPlacement: 'system-message',
      buildSystemPrompt: () => '',
    },
    coordinates: { shape: 'point', order: 'xy', normalizedBy: 1000 },
    parseResponse: () => null,
    transformActions: () => [],
    shouldContinuePlanning: () => false,
    buildResponseLog: () => '',
  };
}

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
        if (adapter.planning.coordinateSystem) {
          expect(adapter.planning.coordinateSystem).toBeTruthy();
        }
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

  it('throws for unknown model families', () => {
    expect(() => getModelAdapter('missing-family' as any)).toThrow(
      /No model adapter registered for modelFamily: missing-family/,
    );
  });

  it('resolves adapters without unsupported user config debug output', () => {
    const testModelFamily = 'test-empty-unsupported';
    const previousConfig = (MODEL_ADAPTER_CONFIGS as any)[testModelFamily];
    (MODEL_ADAPTER_CONFIGS as any)[testModelFamily] = {
      chatCompletion: {
        unsupportedUserConfig: [],
      },
    };
    try {
      const adapter = getModelAdapter(testModelFamily as any);

      expect(adapter.chatCompletion.unsupportedUserConfig).toEqual([]);
    } finally {
      (MODEL_ADAPTER_CONFIGS as any)[testModelFamily] = previousConfig;
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
    expect(
      adapter.locate.resultAdapter.promptSpec.resultValueDescription,
    ).toContain('normalized to 0-1000');
  });

  it('keeps custom planner and locate definitions while applying policy defaults', () => {
    const locateFn = vi.fn();
    const adapter = new ResolvedModelAdapter(
      {
        planning: {
          kind: 'custom',
          planner: createTestPlannerDefinition(),
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
    expect(adapter.planning.planFn).toBeTruthy();
    expect(adapter.planning.coordinateSystem).toBeTruthy();
    expect(adapter.locate.locateFn).toBe(locateFn);
  });

  it('resolves custom planning tap locator definitions with the custom planner', () => {
    const adapter = new ResolvedModelAdapter(
      {
        planning: {
          kind: 'custom',
          planner: createTestPlannerDefinition(),
        },
        locate: {
          kind: 'custom',
          planningTapLocator: {
            buildSystemPrompt: () => 'locate system prompt',
            getLocatedPixelBbox: () => [1, 2, 3, 4],
          },
        },
      },
      'test-custom-locator',
    );

    expect(adapter.locate).toMatchObject({
      kind: 'custom',
      supportsSearchArea: false,
    });
    if (
      adapter.planning.kind !== 'custom' ||
      adapter.locate.kind !== 'custom'
    ) {
      throw new Error('adapter should resolve custom planning tap locator');
    }
    expect(adapter.locate.locateFn).toBeTruthy();
    expect(adapter.planning.coordinateSystem).toBeTruthy();
  });

  it('requires custom planning tap locator definitions to pair with a planner', () => {
    expect(
      () =>
        new ResolvedModelAdapter(
          {
            planning: {
              kind: 'custom',
              planFn: vi.fn(),
            },
            locate: {
              kind: 'custom',
              planningTapLocator: {
                buildSystemPrompt: () => 'locate system prompt',
                getLocatedPixelBbox: () => [1, 2, 3, 4],
              },
            },
          },
          'test-custom-locator-without-planner',
        ),
    ).toThrow(
      /Custom planning tap locator requires a custom planning planner definition/,
    );
  });

  it('applies standard planning overrides from adapter definitions', () => {
    const adapter = new ResolvedModelAdapter(
      {
        planning: {
          cacheEnabled: false,
          defaultReplanningCycleLimit: 7,
          supportsActionDeepLocate: false,
        },
        locate: {
          supportsSearchArea: false,
        },
      },
      'test-standard-overrides',
    );

    expect(adapter.planning).toMatchObject({
      kind: 'standard',
      cacheEnabled: false,
      defaultReplanningCycleLimit: 7,
      supportsActionDeepLocate: false,
    });
    expect(adapter.locate.supportsSearchArea).toBe(false);
  });

  it('throws for unknown json parser presets', () => {
    expect(
      () =>
        new ResolvedModelAdapter(
          {
            jsonParser: 'missing-parser' as any,
          },
          'test-unknown-parser',
        ),
    ).toThrow(/Unknown json parser preset: missing-parser/);
  });

  it('allows adapters to opt custom planning into action deepLocate', () => {
    const adapter = new ResolvedModelAdapter(
      {
        planning: {
          kind: 'custom',
          planner: createTestPlannerDefinition(),
          supportsActionDeepLocate: true,
        },
      },
      'test-custom-planning',
    );

    expect(adapter.planning.supportsActionDeepLocate).toBe(true);
  });

  it('keeps custom planning functions as a fallback escape hatch', () => {
    const planFn = vi.fn();
    const adapter = new ResolvedModelAdapter(
      {
        planning: {
          kind: 'custom',
          planFn,
        },
      },
      'test-custom-planning-function',
    );

    expect(adapter.planning).toMatchObject({
      kind: 'custom',
      cacheEnabled: true,
      defaultReplanningCycleLimit: 20,
      supportsActionDeepLocate: false,
    });
    if (adapter.planning.kind !== 'custom') {
      throw new Error('adapter should keep custom planning function');
    }
    expect(adapter.planning.planFn).toBe(planFn);
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
