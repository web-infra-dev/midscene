import { parseModelResponseJson } from '../shared/json';
import { resolveChatCompletion } from './chat-completion';
import { resolveInsight } from './insight';
import type { InsightAdapter } from './insight-protocol';
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
    return parseModelResponseJson;
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
  readonly acceptBbox2dAlias: boolean;
  readonly imagePreprocess: ImagePreprocessPolicy;
  readonly insight: InsightAdapter;
  readonly planning: PlanningAdapter;
  readonly locate: LocateAdapter;

  constructor(config: ModelAdapterDefinition, modelFamily: string) {
    this.jsonParser = resolveJsonParser(config.jsonParser);
    this.chatCompletion = resolveChatCompletion(config.chatCompletion);
    this.acceptBbox2dAlias = config.acceptBbox2dAlias ?? false;
    this.imagePreprocess = resolveImagePreprocess(config.imagePreprocess);
    this.insight = resolveInsight(config.insight, {
      jsonParser: this.jsonParser,
    });
    const customPlanner =
      config.planning?.kind === 'custom' ? config.planning.planner : undefined;
    const resolvedCustomPlanner = customPlanner
      ? resolveCustomPlanningDefinition(customPlanner)
      : undefined;
    this.locate = resolveLocate(
      config.locate,
      resolvedCustomPlanner,
      {
        jsonParser: this.jsonParser,
      },
      this.acceptBbox2dAlias,
    );
    this.planning = resolvePlanning(
      config.planning,
      resolvedCustomPlanner,
      { jsonParser: this.jsonParser },
      this.locate.kind === 'standard'
        ? this.locate.element.resultCodec
        : undefined,
    );
  }
}
