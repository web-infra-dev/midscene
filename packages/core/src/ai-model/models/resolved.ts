import { normalJsonParser } from '../shared/json';
import { createLocateResultAdapter } from '../shared/model-locate-result/factory';
import type {
  LocateResultAdapter,
  LocateResultAdapterDefinition,
} from '../shared/model-locate-result/types';
import type {
  ChatCompletionAdapter,
  ChatCompletionParamsResult,
  ImagePreprocessPolicy,
  JsonParser,
  LocateAdapter,
  ModelAdapter,
  ModelAdapterDefinition,
  PlanningAdapter,
} from './types';

const defaultReplanningCycleLimit = 20;

const defaultImageDetail = () => undefined;

function buildChatCompletionParams(): ChatCompletionParamsResult {
  return { config: {} };
}

const defaultLocateResultAdapterDefinition: LocateResultAdapterDefinition = {
  format: 'bbox-normalized-0-1000-xyxy',
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
  return {
    buildChatCompletionParams:
      chatCompletion?.buildChatCompletionParams ?? buildChatCompletionParams,
    resolveImageDetail:
      chatCompletion?.resolveImageDetail ?? defaultImageDetail,
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
): PlanningAdapter {
  if (planning?.kind === 'custom') {
    return {
      kind: 'custom',
      cacheEnabled: planning.cacheEnabled ?? true,
      defaultReplanningCycleLimit:
        planning.defaultReplanningCycleLimit ?? defaultReplanningCycleLimit,
      planFn: planning.planFn,
    };
  }

  return {
    kind: 'standard',
    cacheEnabled: planning?.cacheEnabled ?? true,
    defaultReplanningCycleLimit:
      planning?.defaultReplanningCycleLimit ?? defaultReplanningCycleLimit,
  };
}

function resolveLocateResultAdapter(
  resultAdapter:
    | LocateResultAdapter
    | LocateResultAdapterDefinition
    | undefined,
): LocateResultAdapter {
  if (!resultAdapter) {
    return createLocateResultAdapter(defaultLocateResultAdapterDefinition);
  }

  if ('responseFormat' in resultAdapter) {
    return resultAdapter;
  }

  return createLocateResultAdapter(resultAdapter);
}

function resolveLocate(
  locate: ModelAdapterDefinition['locate'],
): LocateAdapter {
  if (locate?.kind === 'custom') {
    return {
      kind: 'custom',
      supportsSearchArea: locate.supportsSearchArea ?? false,
      locateFn: locate.locateFn,
    };
  }

  return {
    kind: 'standard',
    supportsSearchArea: locate?.supportsSearchArea ?? true,
    resultAdapter: resolveLocateResultAdapter(locate?.resultAdapter),
  };
}

export class ResolvedModelAdapter implements ModelAdapter {
  readonly jsonParser: JsonParser;
  readonly chatCompletion: ChatCompletionAdapter;
  readonly imagePreprocess: ImagePreprocessPolicy;
  readonly planning: PlanningAdapter;
  readonly locate: LocateAdapter;

  constructor(config: ModelAdapterDefinition = {}) {
    this.jsonParser = resolveJsonParser(config.jsonParser);
    this.chatCompletion = resolveChatCompletion(config.chatCompletion);
    this.imagePreprocess = resolveImagePreprocess(config.imagePreprocess);
    this.planning = resolvePlanning(config.planning);
    this.locate = resolveLocate(config.locate);
  }
}
