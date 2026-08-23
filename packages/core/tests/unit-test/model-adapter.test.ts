import type { CustomPlanningDefinition } from '@/ai-model/model-adapter/custom-planning-types';
import { createDefaultElementProtocol } from '@/ai-model/model-adapter/default-locate-protocol';
import { createDefaultMidscenePlanningProtocol } from '@/ai-model/model-adapter/default-planning-protocol';
import type { StandardPlanningProtocol } from '@/ai-model/model-adapter/planning-protocol';
import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { getModelAdapter } from '@/ai-model/models';
import { MODEL_ADAPTER_CONFIGS } from '@/ai-model/models/registry';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import { MODEL_FAMILY_VALUES, type TModelFamily } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

const defaultMidscenePlanningProtocol = createDefaultMidscenePlanningProtocol({
  jsonParser: parseModelResponseJson,
});

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
    expect(adapter.chatCompletion.useReasoningAsContentFallback).toBe(true);
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

  it('enables reasoning-as-content fallback for default and supported model families', () => {
    const enabledFamilies: TModelFamily[] = [
      'doubao-vision',
      'doubao-seed',
      'qwen3-vl',
      'qwen3',
      'qwen3.5',
      'qwen3.6',
      'glm-v',
      'kimi',
      'kimi3',
      'xiaomi-mimo',
    ];
    const enabledSet = new Set<TModelFamily>(enabledFamilies);

    for (const modelFamily of MODEL_FAMILY_VALUES) {
      expect(
        getModelAdapter(modelFamily).chatCompletion
          .useReasoningAsContentFallback,
      ).toBe(enabledSet.has(modelFamily));
    }

    expect(getModelAdapter().chatCompletion.useReasoningAsContentFallback).toBe(
      true,
    );
  });

  it('replays raw assistant messages only for kimi3', () => {
    for (const modelFamily of MODEL_FAMILY_VALUES) {
      expect(
        getModelAdapter(modelFamily).chatCompletion.replayRawAssistantMessage,
      ).toBe(modelFamily === 'kimi3');
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
    if (adapter.planning.kind !== 'standard') {
      throw new Error('default adapter should use standard planning');
    }
    expect(adapter.planning.protocol.actionSpaceProtocol).toEqual(
      defaultMidscenePlanningProtocol.actionSpaceProtocol,
    );
    expect(
      adapter.planning.protocol.actionOutputProtocol.actionOutputTagNames,
    ).toEqual(
      defaultMidscenePlanningProtocol.actionOutputProtocol.actionOutputTagNames,
    );
    expect(adapter.locate.kind).toBe('standard');
    if (adapter.locate.kind !== 'standard') {
      throw new Error('default adapter should use standard locate');
    }
    expect(adapter.locate.elementProtocol).toBeDefined();
    expect(adapter.locate.searchAreaProtocol).toBeDefined();
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
      cacheEnabled: false,
      defaultReplanningCycleLimit: 20,
      supportsActionDeepLocate: false,
    });
    expect(adapter.locate).toMatchObject({ kind: 'custom' });
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

  it('uses the default search-area protocol unless it is explicitly disabled', () => {
    const adapterWithExplicitElementProtocol = new ResolvedModelAdapter(
      {
        locate: {
          elementProtocol: createDefaultElementProtocol,
        },
      },
      'test-default-search-area',
    );
    const adapterWithoutSearchArea = new ResolvedModelAdapter(
      {
        locate: {
          searchAreaProtocol: false,
        },
      },
      'test-disabled-search-area',
    );

    expect(adapterWithExplicitElementProtocol.locate.kind).toBe('standard');
    expect(adapterWithoutSearchArea.locate.kind).toBe('standard');
    if (
      adapterWithExplicitElementProtocol.locate.kind !== 'standard' ||
      adapterWithoutSearchArea.locate.kind !== 'standard'
    ) {
      throw new Error('test adapters should use standard locate');
    }
    expect(
      adapterWithExplicitElementProtocol.locate.searchAreaProtocol,
    ).toBeDefined();
    expect(adapterWithoutSearchArea.locate.searchAreaProtocol).toBeUndefined();
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

    expect(adapter.locate).toMatchObject({ kind: 'custom' });
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
    const planningProtocol: StandardPlanningProtocol = {
      ...defaultMidscenePlanningProtocol,
      actionSpaceProtocol: {
        ...defaultMidscenePlanningProtocol.actionSpaceProtocol,
        title: 'Test actions',
      },
    };
    const adapter = new ResolvedModelAdapter(
      {
        planning: {
          cacheEnabled: false,
          defaultReplanningCycleLimit: 7,
          supportsActionDeepLocate: false,
          protocol: planningProtocol,
        },
      },
      'test-standard-overrides',
    );

    expect(adapter.planning).toMatchObject({
      kind: 'standard',
      cacheEnabled: false,
      defaultReplanningCycleLimit: 7,
      supportsActionDeepLocate: false,
      protocol: planningProtocol,
    });
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
      cacheEnabled: false,
      defaultReplanningCycleLimit: 20,
      supportsActionDeepLocate: false,
    });
    if (adapter.planning.kind !== 'custom') {
      throw new Error('adapter should keep custom planning function');
    }
    expect(adapter.planning.planFn).toBe(planFn);
  });
});
