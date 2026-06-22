import { normalJsonParser } from '../service-caller/json';
import { resolveChatCompletion } from './chat-completion';
import { resolveLocate } from './locate';
import { resolveCustomPlanningDefinition, resolvePlanning } from './planning';
import type {
  ChatCompletionAdapter,
  ImagePreprocessPolicy,
  JsonParser,
  LocateAdapter,
  ModelAdapter,
  ModelAdapterDefinition,
  PlanningAdapter,
} from './types';

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

function resolveImagePreprocess(
  imagePreprocess: ModelAdapterDefinition['imagePreprocess'],
): ImagePreprocessPolicy {
  return {
    padBlockSize: imagePreprocess?.padBlockSize,
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
