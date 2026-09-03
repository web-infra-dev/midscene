import type { PixelBbox, PlanningAction } from '@/types';
import type { AIUsageInfo } from '@/types';
import type {
  IModelConfig,
  TIntent,
  TModelReasoningEnabled,
  TModelResponseFormat,
} from '@midscene/shared/env';
import type OpenAI from 'openai';
import type {
  JsonParser,
  JsonParserContext,
  JsonParserSource,
} from '../shared/json';
import type {
  LocateResultCodec,
  LocateResultFormatDefinition,
  ResolvedLocateResultCoordinates,
} from '../shared/model-locate-result/types';
import type { LocateFn } from '../workflows/grounding/types';
import type { PlanFn } from '../workflows/planning/types';
import type { CustomPlanningDefinition } from './custom-planning-types';
import type { ImagePreprocessPolicy } from './image-preprocess';
import type { InsightAdapter, InsightDefinition } from './insight-protocol';
import type {
  StandardLocateProtocol,
  StandardLocateProtocolDefinition,
} from './locate-protocol';
import type {
  StandardPlanningProtocol,
  StandardPlanningProtocolDefinition,
} from './planning-protocol';

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
  responseFormat?: TModelResponseFormat;
}

export type ChatCompletionUnsupportedUserConfig =
  keyof ChatCompletionCallUserConfig;

export interface ChatCompletionCallInput {
  intent?: TIntent;
  /**
   * Model name resolved for this call. Adapters may use it to branch within a
   * family when a specific model requires different request parameters (for
   * example, always-thinking variants).
   */
  modelName?: string;
  userConfig?: ChatCompletionCallUserConfig;
  /**
   * Number of preceding semantic parsing failures for this request.
   * This is execution context, not part of the user's model configuration.
   */
  semanticRetryAttempt?: number;
  requiresOriginalImageDetail?: boolean;
  /**
   * Whether this call expects a JSON object response.
   *
   * This must not be inferred from `intent === 'default'`: intent selects a
   * model-config slot, while many non-locate calls (for example, browser
   * extension recording data generation that produces YAML) also use the
   * default model.
   */
  expectedJsonObjectResponse?: boolean;
}

export interface ChatCompletionCallContext {
  intent?: TIntent;
  /**
   * Model name resolved for this call; see ChatCompletionCallInput.
   */
  modelName?: string;
  userConfig: ChatCompletionCallUserConfig;
  semanticRetryAttempt?: number;
  requiresOriginalImageDetail?: boolean;
  expectedJsonObjectResponse?: boolean;
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
  useReasoningAsContentFallback: boolean;
  replayRawAssistantMessage: boolean;
}

type ChatCompletionMessageExtraction =
  | {
      messageExtraction?: {
        kind: 'default';
        reasoningContentKeys?: string[];
      };
    }
  | {
      messageExtraction: {
        kind: 'custom';
        extractContentAndReasoning: ExtractContentAndReasoning;
      };
    };

export type ChatCompletionDefinition = ChatCompletionMessageExtraction & {
  unsupportedUserConfig?: ChatCompletionUnsupportedUserConfig[];
  buildChatCompletionParams?: (
    input: ChatCompletionCallContext,
  ) => ChatCompletionParamsResult;
  resolveImageDetail?: (
    input: ChatCompletionCallContext,
  ) => ImageDetail | undefined;
  useReasoningAsContentFallback?: boolean;
  /**
   * Replay the provider's original assistant message in later planning turns.
   *
   * Enable this only for model families whose API requires opaque response
   * fields (for example, reasoning state or thought signatures) to be passed
   * back unchanged. The default replays Midscene's normalized assistant text.
   */
  replayRawAssistantMessage?: boolean;
};

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
      protocol: StandardPlanningProtocol;
      locateResultCodec?: LocateResultCodec;
    })
  | (PlanningPolicy & {
      kind: 'custom';
      planFn: PlanFn;
      coordinateSystem?: ResolvedLocateResultCoordinates;
    });

export type PlanningDefinition =
  | (Partial<PlanningPolicy> & {
      kind?: 'standard';
      protocol?: StandardPlanningProtocolDefinition;
      locateResultFormat?: LocateResultFormatDefinition | false;
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

export type LocateUserMessageContentOrder = 'image-first' | 'prompt-first';

type StandardLocateAdapter = {
  kind: 'standard';
  userMessageContentOrder: LocateUserMessageContentOrder;
  element: LocateOperation;
  searchArea?: LocateOperation;
};

interface LocateOperation {
  protocol: StandardLocateProtocol;
  resultCodec: LocateResultCodec;
}

type CustomLocateAdapter = {
  kind: 'custom';
  locateFn: LocateFn;
};

export type LocateAdapter = StandardLocateAdapter | CustomLocateAdapter;

type StandardLocateDefinition = {
  kind?: 'standard';
  userMessageContentOrder?: LocateUserMessageContentOrder;
  element?: LocateOperationDefinition;
  searchArea?: LocateOperationDefinition | false;
};

interface LocateOperationDefinition {
  protocol?: StandardLocateProtocolDefinition;
  resultFormat?: LocateResultFormatDefinition;
}

export interface PlanningTapLocatorDefinition {
  buildSystemPrompt(): string;
  getLocatedPixelBbox(actions: PlanningAction[]): PixelBbox | undefined;
}

type CustomLocateDefinition = {
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
  acceptBbox2dAlias: boolean;
  imagePreprocess: ImagePreprocessPolicy;
  insight: InsightAdapter;
  planning: PlanningAdapter;
  locate: LocateAdapter;
}

export interface ModelRuntime {
  config: IModelConfig;
  adapter: ModelAdapter;
  /**
   * Report execution that owns this model runtime. It is carried on a
   * per-execution runtime copy so concurrent Agent operations never share it.
   */
  executionId?: string;
  /**
   * Optional callback fired after every underlying model call with the shaped
   * usage info. Provides a single collection point for callers that want to
   * aggregate usage across all model invocations (including auxiliary calls
   * such as order-sensitive judging and deep-locate search-area calls).
   */
  onUsage?: (usage: AIUsageInfo) => void;
}

export interface ModelAdapterDefinition {
  jsonParser?: JsonParserPreset | JsonParser;
  chatCompletion?: ChatCompletionDefinition;
  /**
   * Temporary compatibility for models that may occasionally return
   * `bbox_2d` instead of `bbox`. Currently enabled only by Qwen adapters and
   * should be removed once this model behavior no longer needs accommodation.
   */
  acceptBbox2dAlias?: boolean;
  imagePreprocess?: ImagePreprocessDefinition;
  insight?: InsightDefinition;
  planning?: PlanningDefinition;
  locate?: LocateDefinition;
}
