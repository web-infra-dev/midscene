import type {
  IModelConfig,
  TIntent,
  TModelReasoningEnabled,
} from '@midscene/shared/env';
import type OpenAI from 'openai';
import type {
  JsonParser,
  JsonParserContext,
  JsonParserSource,
} from '../service-caller/json';
import type {
  LocateResultAdapter,
  LocateResultAdapterDefinition,
  ResolvedLocateResultCoordinates,
} from '../shared/model-locate-result/types';
import type { ImagePreprocessPolicy } from '../workflows/image-preprocess';
import type { PlanningTapLocatorDefinition } from '../workflows/inspect/planning-action-locate';
import type { LocateFn } from '../workflows/inspect/types';
import type { CustomPlanningDefinition } from '../workflows/planning/custom-planning-types';
import type { PlanFn } from '../workflows/planning/types';

export type {
  ImagePreprocessPolicy,
  JsonParser,
  JsonParserContext,
  JsonParserSource,
};

export type JsonParserPreset = 'lenient-json';

export interface ReasoningInput {
  reasoningEnabled?: TModelReasoningEnabled;
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

export interface ContentAndReasoning {
  content: string;
  reasoning_content: string;
}

export type ChatCompletionContentSource =
  | (OpenAI.Chat.Completions.ChatCompletionMessage & {
      reasoning_content?: string;
    })
  | (OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
      reasoning_content?: string;
    });

export type ExtractContentAndReasoning = (
  message: ChatCompletionContentSource | undefined,
) => ContentAndReasoning;

export interface ChatCompletionAdapter {
  unsupportedUserConfig: ChatCompletionUnsupportedUserConfig[];
  buildChatCompletionParams(
    input: ChatCompletionCallInput,
  ): ChatCompletionParamsResult;
  resolveImageDetail(input: ChatCompletionCallInput): ImageDetail | undefined;
  extractContentAndReasoning: ExtractContentAndReasoning;
}

export interface ChatCompletionDefinition {
  unsupportedUserConfig?: ChatCompletionUnsupportedUserConfig[];
  buildChatCompletionParams?: (
    input: ChatCompletionCallContext,
  ) => ChatCompletionParamsResult;
  resolveImageDetail?: (
    input: ChatCompletionCallContext,
  ) => ImageDetail | undefined;
  extractContentAndReasoning?: ExtractContentAndReasoning;
}

export type ImagePreprocessDefinition = Partial<ImagePreprocessPolicy>;

interface PlanningPolicy {
  cacheEnabled: boolean;
  defaultReplanningCycleLimit: number;
  /**
   * Whether aiAct can use planning action coordinates as the first-stage
   * search area for deepLocate.
   *
   * Custom planning models may return only action coordinates without a target
   * element description. Those results can be used as direct plan hits, but
   * cannot drive deepLocate's second-stage locate call because that call also
   * needs a query prompt describing the target element.
   */
  supportsActionDeepLocate: boolean;
}

export type PlanningAdapter =
  | (PlanningPolicy & {
      kind: 'standard';
    })
  | (PlanningPolicy & {
      kind: 'custom';
      planFn: PlanFn;
      coordinateSystem?: ResolvedLocateResultCoordinates;
    });

export type PlanningDefinition =
  | (Partial<PlanningPolicy> & {
      kind?: 'standard';
    })
  | (Partial<PlanningPolicy> &
      (
        | {
            kind: 'custom';
            planner: CustomPlanningDefinition<any>;
            planFn?: never;
          }
        | {
            kind: 'custom';
            planFn: PlanFn;
            planner?: never;
          }
      ));

interface LocatePolicy {
  /**
   * Whether the locate adapter supports finding a coarse search area before the
   * final element locate step.
   *
   * Some custom model families provide their own planning flow but do not
   * support standalone locate/section-locate. They cannot behave like standard
   * deepLocate, where a reference element is first located to build the search
   * area for the final locate call.
   */
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
} & (
    | {
        locateFn: LocateFn;
        planningTapLocator?: never;
      }
    | {
        planningTapLocator: PlanningTapLocatorDefinition;
        locateFn?: never;
      }
  );

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
