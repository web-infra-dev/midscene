import type { TIntent } from '@midscene/shared/env';
import type { JsonParser } from '../shared/json';
import type {
  LocateResultAdapter,
  LocateResultAdapterDefinition,
} from '../shared/model-locate-result/types';
import type { ImagePreprocessPolicy } from '../workflows/image-preprocess';
import type { LocateFn } from '../workflows/inspect/types';
import type { PlanFn } from '../workflows/planning/types';

export type { ImagePreprocessPolicy, JsonParser };

export type JsonParserPreset = 'lenient-json';

export interface ReasoningInput {
  reasoningEnabled?: boolean;
  reasoningEffort?: string;
  reasoningBudget?: number;
}

export interface ChatCompletionParamsResult {
  config: Record<string, unknown>;
  debugMessages?: string[];
  /**
   * Request parameter names owned by the adapter. Values for these keys from
   * env-derived common params or user extraBody will be ignored by the caller.
   * Use this for provider constraints such as GPT-5 Chat Completions rejecting
   * `temperature`.
   */
  lockedParams?: string[];
}

export interface ModelCallContext extends ReasoningInput {
  intent?: TIntent;
  temperature?: number;
}

export type ImageDetail = 'auto' | 'low' | 'high' | 'original';

export interface ChatCompletionAdapter {
  buildChatCompletionParams(
    input: ModelCallContext,
  ): ChatCompletionParamsResult;
  resolveImageDetail(input: ModelCallContext): ImageDetail | undefined;
}

export interface ChatCompletionDefinition {
  buildChatCompletionParams?: ChatCompletionAdapter['buildChatCompletionParams'];
  resolveImageDetail?: ChatCompletionAdapter['resolveImageDetail'];
}

export type ImagePreprocessDefinition = Partial<ImagePreprocessPolicy>;

interface PlanningPolicy {
  cacheEnabled: boolean;
  defaultReplanningCycleLimit: number;
}

export type PlanningAdapter =
  | (PlanningPolicy & {
      kind: 'standard';
    })
  | (PlanningPolicy & {
      kind: 'custom';
      planFn: PlanFn;
    });

export type PlanningDefinition =
  | (Partial<PlanningPolicy> & {
      kind?: 'standard';
    })
  | (Partial<PlanningPolicy> & {
      kind: 'custom';
      planFn: PlanFn;
    });

interface LocatePolicy {
  supportsSearchArea: boolean;
}

export type LocateAdapter =
  | (LocatePolicy & {
      kind: 'standard';
      resultAdapter: LocateResultAdapter;
    })
  | (LocatePolicy & {
      kind: 'custom';
      locateFn: LocateFn;
    });

export type LocateDefinition =
  | (Partial<LocatePolicy> & {
      kind?: 'standard';
      resultAdapter?: LocateResultAdapter | LocateResultAdapterDefinition;
    })
  | (Partial<LocatePolicy> & {
      kind: 'custom';
      locateFn: LocateFn;
    });

export interface ModelAdapter {
  jsonParser: JsonParser;
  chatCompletion: ChatCompletionAdapter;
  imagePreprocess: ImagePreprocessPolicy;
  planning: PlanningAdapter;
  locate: LocateAdapter;
}

export interface ModelAdapterDefinition {
  jsonParser?: JsonParserPreset | JsonParser;
  chatCompletion?: ChatCompletionDefinition;
  imagePreprocess?: ImagePreprocessDefinition;
  planning?: PlanningDefinition;
  locate?: LocateDefinition;
}
