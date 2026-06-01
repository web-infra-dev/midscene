import type { IModelConfig, TIntent } from '@midscene/shared/env';
import type {
  JsonParser,
  JsonParserContext,
  JsonParserSource,
} from '../service-caller/json';
import type {
  LocateResultAdapter,
  LocateResultAdapterDefinition,
} from '../shared/model-locate-result/types';
import type { ImagePreprocessPolicy } from '../workflows/image-preprocess';
import type { LocateFn } from '../workflows/inspect/types';
import type { PlanFn } from '../workflows/planning/types';

export type {
  ImagePreprocessPolicy,
  JsonParser,
  JsonParserContext,
  JsonParserSource,
};

export type JsonParserPreset = 'lenient-json';

export interface ReasoningInput {
  reasoningEnabled?: boolean;
  reasoningEffort?: string;
  reasoningBudget?: number;
}

export interface ChatCompletionParamsResult {
  config: Record<string, unknown>;
}

export interface MidsceneChatCompletionDefaults {
  temperature: number;
}

export interface ChatCompletionCallUserConfig extends ReasoningInput {
  temperature?: number;
}

export type ChatCompletionUnsupportedUserConfig =
  keyof ChatCompletionCallUserConfig;

export interface ChatCompletionCallInput {
  intent?: TIntent;
  userConfig?: ChatCompletionCallUserConfig;
  requiresOriginalImageDetail?: boolean;
}

export interface ChatCompletionCallContext {
  intent?: TIntent;
  userConfig: ChatCompletionCallUserConfig;
  requiresOriginalImageDetail?: boolean;
  midsceneDefaults: MidsceneChatCompletionDefaults;
}

export type ImageDetail = 'auto' | 'low' | 'high' | 'original';

export interface ChatCompletionAdapter {
  unsupportedUserConfig: ChatCompletionUnsupportedUserConfig[];
  buildChatCompletionParams(
    input: ChatCompletionCallInput,
  ): ChatCompletionParamsResult;
  resolveImageDetail(input: ChatCompletionCallInput): ImageDetail | undefined;
}

export interface ChatCompletionDefinition {
  unsupportedUserConfig?: ChatCompletionUnsupportedUserConfig[];
  buildChatCompletionParams?: (
    input: ChatCompletionCallContext,
  ) => ChatCompletionParamsResult;
  resolveImageDetail?: (
    input: ChatCompletionCallContext,
  ) => ImageDetail | undefined;
}

export type ImagePreprocessDefinition = Partial<ImagePreprocessPolicy>;

interface PlanningPolicy {
  cacheEnabled: boolean;
  defaultReplanningCycleLimit: number;
  supportsActionDeepLocate: boolean;
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

type StandardLocateAdapter = LocatePolicy & {
  kind: 'standard';
  resultAdapter: LocateResultAdapter;
};

type CustomLocateAdapter = LocatePolicy & {
  kind: 'custom';
  locateFn: LocateFn;
};

export type LocateAdapter = StandardLocateAdapter | CustomLocateAdapter;

type StandardLocateDefinition = Partial<LocatePolicy> & {
  kind?: 'standard';
  resultAdapter?: LocateResultAdapterDefinition;
};

type CustomLocateDefinition = Partial<LocatePolicy> & {
  kind: 'custom';
  locateFn: LocateFn;
};

export type LocateDefinition =
  | StandardLocateDefinition
  | CustomLocateDefinition;

export interface ModelAdapter {
  jsonParser: JsonParser;
  chatCompletion: ChatCompletionAdapter;
  imagePreprocess: ImagePreprocessPolicy;
  planning: PlanningAdapter;
  locate: LocateAdapter;
}

export interface ModelRuntime {
  config: IModelConfig;
  adapter: ModelAdapter;
}

export interface ModelAdapterDefinition {
  jsonParser?: JsonParserPreset | JsonParser;
  chatCompletion?: ChatCompletionDefinition;
  imagePreprocess?: ImagePreprocessDefinition;
  planning?: PlanningDefinition;
  locate?: LocateDefinition;
}
