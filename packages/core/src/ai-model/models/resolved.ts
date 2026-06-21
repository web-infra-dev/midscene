import { resolveCustomPlanningDefinition } from '../adapter-resolver/custom-planning';
import { normalJsonParser } from '../service-caller/json';
import { createLocateResultAdapter } from '../shared/model-locate-result/factory';
import type { LocateResultAdapterDefinition } from '../shared/model-locate-result/types';
import { resolvePlanningTapLocator } from '../workflows/inspect/planning-action-locate';
import { runCustomPlanning } from '../workflows/planning/custom-planning';
import type { ResolvedCustomPlanningDefinition } from '../workflows/planning/custom-planning-types';
import { defaultExtractContentAndReasoning } from './chat-content';
import type {
  ChatCompletionAdapter,
  ChatCompletionCallContext,
  ChatCompletionCallInput,
  ImagePreprocessPolicy,
  JsonParser,
  LocateAdapter,
  MidsceneChatCompletionDefaults,
  ModelAdapter,
  ModelAdapterDefinition,
  PlanningAdapter,
} from './types';

const defaultReplanningCycleLimit = 20;

const defaultImageDetail = (_input: unknown) => undefined;

const defaultChatCompletionParams = ({
  midsceneDefaults,
  userConfig,
}: ChatCompletionCallContext) => ({
  config: {
    temperature: userConfig.temperature ?? midsceneDefaults.temperature,
  },
});

const midsceneChatCompletionDefaults: MidsceneChatCompletionDefaults = {
  temperature: 0,
};

const defaultLocateResultAdapterDefinition: LocateResultAdapterDefinition = {
  coordinates: { shape: 'bbox', order: 'xy', normalizedBy: 1000 },
};

function resolveJsonParser(
  jsonParser: ModelAdapterDefinition['jsonParser'],
): JsonParser {
  if (!jsonParser || jsonParser === 'lenient-json') {
    return normalJsonParser;
  }

  if (typeof jsonParser === 'function') {
    return jsonParser;
  }

  throw new Error(`Unknown json parser preset: ${jsonParser}`);
}

function resolveChatCompletion(
  chatCompletion: ModelAdapterDefinition['chatCompletion'],
): ChatCompletionAdapter {
  const buildChatCompletionParams =
    chatCompletion?.buildChatCompletionParams ?? defaultChatCompletionParams;
  const resolveImageDetail =
    chatCompletion?.resolveImageDetail ?? defaultImageDetail;
  const unsupportedUserConfig = chatCompletion?.unsupportedUserConfig ?? [];
  const extractContentAndReasoning =
    chatCompletion?.extractContentAndReasoning ??
    defaultExtractContentAndReasoning;

  return {
    unsupportedUserConfig,
    buildChatCompletionParams: (input) => {
      const context = {
        ...input,
        userConfig: input.userConfig ?? {},
        midsceneDefaults: midsceneChatCompletionDefaults,
      };
      return buildChatCompletionParams(context);
    },
    resolveImageDetail: (input) =>
      resolveImageDetail({
        ...input,
        userConfig: input.userConfig ?? {},
        midsceneDefaults: midsceneChatCompletionDefaults,
      }),
    extractContentAndReasoning,
  };
}

function resolveImagePreprocess(
  imagePreprocess: ModelAdapterDefinition['imagePreprocess'],
): ImagePreprocessPolicy {
  return {
    padBlockSize: imagePreprocess?.padBlockSize,
  };
}

function resolvePlanning(
  planning: ModelAdapterDefinition['planning'],
  resolvedCustomPlanner?: ResolvedCustomPlanningDefinition,
): PlanningAdapter {
  if (planning?.kind === 'custom') {
    if (typeof planning.planFn === 'function') {
      return {
        kind: 'custom',
        cacheEnabled: planning.cacheEnabled ?? true,
        defaultReplanningCycleLimit:
          planning.defaultReplanningCycleLimit ?? defaultReplanningCycleLimit,
        supportsActionDeepLocate: planning.supportsActionDeepLocate ?? false,
        planFn: planning.planFn,
      };
    }

    if (!resolvedCustomPlanner) {
      throw new Error('Custom planning planner definition is not resolved');
    }

    return {
      kind: 'custom',
      cacheEnabled: planning.cacheEnabled ?? true,
      defaultReplanningCycleLimit:
        planning.defaultReplanningCycleLimit ?? defaultReplanningCycleLimit,
      supportsActionDeepLocate: planning.supportsActionDeepLocate ?? false,
      coordinateSystem: resolvedCustomPlanner.coordinateSystem,
      planFn: (userInstruction, options) =>
        runCustomPlanning(userInstruction, options, resolvedCustomPlanner),
    };
  }

  return {
    kind: 'standard',
    cacheEnabled: planning?.cacheEnabled ?? true,
    defaultReplanningCycleLimit:
      planning?.defaultReplanningCycleLimit ?? defaultReplanningCycleLimit,
    supportsActionDeepLocate: planning?.supportsActionDeepLocate ?? true,
  };
}

function resolveLocate(
  locate: ModelAdapterDefinition['locate'],
  resolvedCustomPlanner: ResolvedCustomPlanningDefinition | undefined,
): LocateAdapter {
  if (locate?.kind === 'custom') {
    let locateFn = locate.locateFn;

    if (!locateFn) {
      const planningTapLocator = locate.planningTapLocator;

      if (!planningTapLocator) {
        throw new Error(
          'Custom locate definition requires either locateFn or planningTapLocator',
        );
      }

      if (!resolvedCustomPlanner) {
        throw new Error(
          'Custom planning tap locator requires a custom planning planner definition',
        );
      }
      locateFn = resolvePlanningTapLocator(
        planningTapLocator,
        resolvedCustomPlanner,
      );
    }

    return {
      kind: 'custom',
      supportsSearchArea: locate.supportsSearchArea ?? false,
      locateFn,
    };
  }

  return {
    kind: 'standard',
    supportsSearchArea: locate?.supportsSearchArea ?? true,
    resultAdapter: createLocateResultAdapter(
      locate?.resultAdapter ?? defaultLocateResultAdapterDefinition,
    ),
  };
}

export class ResolvedModelAdapter implements ModelAdapter {
  readonly jsonParser: JsonParser;
  readonly chatCompletion: ChatCompletionAdapter;
  readonly imagePreprocess: ImagePreprocessPolicy;
  readonly planning: PlanningAdapter;
  readonly locate: LocateAdapter;

  constructor(config: ModelAdapterDefinition, modelFamily: string) {
    this.jsonParser = resolveJsonParser(config.jsonParser);
    this.chatCompletion = resolveChatCompletion(config.chatCompletion);
    this.imagePreprocess = resolveImagePreprocess(config.imagePreprocess);
    const customPlanner =
      config.planning?.kind === 'custom' ? config.planning.planner : undefined;
    const resolvedCustomPlanner = customPlanner
      ? resolveCustomPlanningDefinition(customPlanner)
      : undefined;
    this.planning = resolvePlanning(config.planning, resolvedCustomPlanner);
    this.locate = resolveLocate(config.locate, resolvedCustomPlanner);
  }
}
