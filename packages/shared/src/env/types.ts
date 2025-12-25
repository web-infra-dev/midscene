// config keys
export const MIDSCENE_MODEL_INIT_CONFIG_JSON =
  'MIDSCENE_MODEL_INIT_CONFIG_JSON';
export const MIDSCENE_MODEL_NAME = 'MIDSCENE_MODEL_NAME';
export const MIDSCENE_DEBUG_MODEL_PROFILE = 'MIDSCENE_DEBUG_MODEL_PROFILE';
export const MIDSCENE_DEBUG_MODEL_RESPONSE = 'MIDSCENE_DEBUG_MODEL_RESPONSE';
export const MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG =
  'MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG';
export const MIDSCENE_DEBUG_MODE = 'MIDSCENE_DEBUG_MODE';
export const MIDSCENE_MCP_USE_PUPPETEER_MODE =
  'MIDSCENE_MCP_USE_PUPPETEER_MODE';
export const MIDSCENE_MCP_CHROME_PATH = 'MIDSCENE_MCP_CHROME_PATH';
export const MIDSCENE_MCP_ANDROID_MODE = 'MIDSCENE_MCP_ANDROID_MODE';
export const DOCKER_CONTAINER = 'DOCKER_CONTAINER';
export const MIDSCENE_FORCE_DEEP_THINK = 'MIDSCENE_FORCE_DEEP_THINK';

// Observability
export const MIDSCENE_LANGSMITH_DEBUG = 'MIDSCENE_LANGSMITH_DEBUG';
export const MIDSCENE_LANGFUSE_DEBUG = 'MIDSCENE_LANGFUSE_DEBUG';

export const MIDSCENE_MODEL_SOCKS_PROXY = 'MIDSCENE_MODEL_SOCKS_PROXY';
export const MIDSCENE_MODEL_HTTP_PROXY = 'MIDSCENE_MODEL_HTTP_PROXY';

// New primary names for public API
export const MIDSCENE_MODEL_API_KEY = 'MIDSCENE_MODEL_API_KEY';
export const MIDSCENE_MODEL_BASE_URL = 'MIDSCENE_MODEL_BASE_URL';
export const MIDSCENE_MODEL_MAX_TOKENS = 'MIDSCENE_MODEL_MAX_TOKENS';
export const MIDSCENE_MODEL_TIMEOUT = 'MIDSCENE_MODEL_TIMEOUT';
export const MIDSCENE_MODEL_TEMPERATURE = 'MIDSCENE_MODEL_TEMPERATURE';

/**
 * @deprecated Use MIDSCENE_MODEL_API_KEY instead. This is kept for backward compatibility.
 */
export const OPENAI_API_KEY = 'OPENAI_API_KEY';
/**
 * @deprecated Use MIDSCENE_MODEL_BASE_URL instead. This is kept for backward compatibility.
 */
export const OPENAI_BASE_URL = 'OPENAI_BASE_URL';
/**
 * @deprecated Use MIDSCENE_MODEL_INIT_CONFIG_JSON instead. This is kept for backward compatibility.
 */
export const MIDSCENE_OPENAI_INIT_CONFIG_JSON =
  'MIDSCENE_OPENAI_INIT_CONFIG_JSON';
/**
 * @deprecated Use MIDSCENE_MODEL_HTTP_PROXY instead. This is kept for backward compatibility.
 */
export const MIDSCENE_OPENAI_HTTP_PROXY = 'MIDSCENE_OPENAI_HTTP_PROXY';
/**
 * @deprecated Use MIDSCENE_MODEL_SOCKS_PROXY instead. This is kept for backward compatibility.
 */
export const MIDSCENE_OPENAI_SOCKS_PROXY = 'MIDSCENE_OPENAI_SOCKS_PROXY';
/**
 * @deprecated Use MIDSCENE_MODEL_MAX_TOKENS instead. This is kept for backward compatibility.
 */
export const OPENAI_MAX_TOKENS = 'OPENAI_MAX_TOKENS';

export const MIDSCENE_ADB_PATH = 'MIDSCENE_ADB_PATH';
export const MIDSCENE_ADB_REMOTE_HOST = 'MIDSCENE_ADB_REMOTE_HOST';
export const MIDSCENE_ADB_REMOTE_PORT = 'MIDSCENE_ADB_REMOTE_PORT';
export const MIDSCENE_ANDROID_IME_STRATEGY = 'MIDSCENE_ANDROID_IME_STRATEGY';

export const MIDSCENE_IOS_DEVICE_UDID = 'MIDSCENE_IOS_DEVICE_UDID';
export const MIDSCENE_IOS_SIMULATOR_UDID = 'MIDSCENE_IOS_SIMULATOR_UDID';

export const MIDSCENE_CACHE = 'MIDSCENE_CACHE';
export const MIDSCENE_USE_VLM_UI_TARS = 'MIDSCENE_USE_VLM_UI_TARS';
export const MIDSCENE_USE_QWEN_VL = 'MIDSCENE_USE_QWEN_VL';
export const MIDSCENE_USE_QWEN3_VL = 'MIDSCENE_USE_QWEN3_VL';
export const MIDSCENE_USE_DOUBAO_VISION = 'MIDSCENE_USE_DOUBAO_VISION';
export const MIDSCENE_USE_GEMINI = 'MIDSCENE_USE_GEMINI';
export const MIDSCENE_USE_VL_MODEL = 'MIDSCENE_USE_VL_MODEL';
export const MATCH_BY_POSITION = 'MATCH_BY_POSITION';
export const MIDSCENE_REPORT_TAG_NAME = 'MIDSCENE_REPORT_TAG_NAME';

export const MIDSCENE_PREFERRED_LANGUAGE = 'MIDSCENE_PREFERRED_LANGUAGE';

export const MIDSCENE_CACHE_MAX_FILENAME_LENGTH =
  'MIDSCENE_CACHE_MAX_FILENAME_LENGTH';

export const MIDSCENE_REPLANNING_CYCLE_LIMIT =
  'MIDSCENE_REPLANNING_CYCLE_LIMIT';

export const MIDSCENE_RUN_DIR = 'MIDSCENE_RUN_DIR';

// INSIGHT (unified VQA and Grounding)
export const MIDSCENE_INSIGHT_MODEL_NAME = 'MIDSCENE_INSIGHT_MODEL_NAME';
export const MIDSCENE_INSIGHT_MODEL_SOCKS_PROXY =
  'MIDSCENE_INSIGHT_MODEL_SOCKS_PROXY';
export const MIDSCENE_INSIGHT_MODEL_HTTP_PROXY =
  'MIDSCENE_INSIGHT_MODEL_HTTP_PROXY';
export const MIDSCENE_INSIGHT_MODEL_BASE_URL =
  'MIDSCENE_INSIGHT_MODEL_BASE_URL';
export const MIDSCENE_INSIGHT_MODEL_API_KEY = 'MIDSCENE_INSIGHT_MODEL_API_KEY';
export const MIDSCENE_INSIGHT_MODEL_INIT_CONFIG_JSON =
  'MIDSCENE_INSIGHT_MODEL_INIT_CONFIG_JSON';
export const MIDSCENE_INSIGHT_MODEL_TIMEOUT = 'MIDSCENE_INSIGHT_MODEL_TIMEOUT';
export const MIDSCENE_INSIGHT_MODEL_TEMPERATURE =
  'MIDSCENE_INSIGHT_MODEL_TEMPERATURE';

// PLANNING
export const MIDSCENE_PLANNING_MODEL_NAME = 'MIDSCENE_PLANNING_MODEL_NAME';
export const MIDSCENE_PLANNING_MODEL_SOCKS_PROXY =
  'MIDSCENE_PLANNING_MODEL_SOCKS_PROXY';
export const MIDSCENE_PLANNING_MODEL_HTTP_PROXY =
  'MIDSCENE_PLANNING_MODEL_HTTP_PROXY';
export const MIDSCENE_PLANNING_MODEL_BASE_URL =
  'MIDSCENE_PLANNING_MODEL_BASE_URL';
export const MIDSCENE_PLANNING_MODEL_API_KEY =
  'MIDSCENE_PLANNING_MODEL_API_KEY';
export const MIDSCENE_PLANNING_MODEL_INIT_CONFIG_JSON =
  'MIDSCENE_PLANNING_MODEL_INIT_CONFIG_JSON';
export const MIDSCENE_PLANNING_MODEL_TIMEOUT =
  'MIDSCENE_PLANNING_MODEL_TIMEOUT';
export const MIDSCENE_PLANNING_MODEL_TEMPERATURE =
  'MIDSCENE_PLANNING_MODEL_TEMPERATURE';
export const MIDSCENE_MODEL_FAMILY = 'MIDSCENE_MODEL_FAMILY';

/**
 * env keys declared but unused
 */
export const UNUSED_ENV_KEYS = [MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG];

/**
 * env keys for debug or basic run
 * can not be override by overrideAIConfig
 */
export const BASIC_ENV_KEYS = [
  MIDSCENE_DEBUG_MODE,
  MIDSCENE_DEBUG_MODEL_PROFILE,
  MIDSCENE_DEBUG_MODEL_RESPONSE,
  MIDSCENE_RUN_DIR,
] as const;

export const BOOLEAN_ENV_KEYS = [
  MIDSCENE_CACHE,
  MIDSCENE_FORCE_DEEP_THINK,
  MIDSCENE_MCP_USE_PUPPETEER_MODE,
  MIDSCENE_MCP_ANDROID_MODE,
  MIDSCENE_LANGSMITH_DEBUG,
  MIDSCENE_LANGFUSE_DEBUG,
] as const;

export const NUMBER_ENV_KEYS = [
  MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
  MIDSCENE_REPLANNING_CYCLE_LIMIT,
] as const;

export const STRING_ENV_KEYS = [
  MIDSCENE_MODEL_MAX_TOKENS,
  OPENAI_MAX_TOKENS,
  MIDSCENE_ADB_PATH,
  MIDSCENE_ADB_REMOTE_HOST,
  MIDSCENE_ADB_REMOTE_PORT,
  MIDSCENE_ANDROID_IME_STRATEGY,
  MIDSCENE_IOS_DEVICE_UDID,
  MIDSCENE_IOS_SIMULATOR_UDID,
  MIDSCENE_REPORT_TAG_NAME,
  MIDSCENE_PREFERRED_LANGUAGE,
  MATCH_BY_POSITION,
  MIDSCENE_MCP_CHROME_PATH,
  DOCKER_CONTAINER,
] as const;

/**
 * Non model related env keys, used for globally controlling the behavior of midscene
 * Can not be override by agent.modelConfig but can be override by overrideAIConfig
 * Can be access at any time
 */
export const GLOBAL_ENV_KEYS = [
  ...BOOLEAN_ENV_KEYS,
  ...NUMBER_ENV_KEYS,
  ...STRING_ENV_KEYS,
] as const;

/**
 * Model related eve keys, used for declare which model to use.
 * Can be override by both agent.modelConfig and overrideAIConfig
 * Can only be access after agent.constructor
 */
export const MODEL_ENV_KEYS = [
  // model default
  MIDSCENE_MODEL_NAME,
  MIDSCENE_MODEL_INIT_CONFIG_JSON,
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_SOCKS_PROXY,
  MIDSCENE_MODEL_HTTP_PROXY,
  MIDSCENE_MODEL_TIMEOUT,
  MIDSCENE_MODEL_TEMPERATURE,
  MIDSCENE_USE_VLM_UI_TARS,
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_QWEN3_VL,
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_GEMINI,
  MIDSCENE_USE_VL_MODEL,
  // model default legacy
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_OPENAI_HTTP_PROXY,
  MIDSCENE_OPENAI_SOCKS_PROXY,
  // INSIGHT (unified VQA and Grounding)
  MIDSCENE_INSIGHT_MODEL_NAME,
  MIDSCENE_INSIGHT_MODEL_SOCKS_PROXY,
  MIDSCENE_INSIGHT_MODEL_HTTP_PROXY,
  MIDSCENE_INSIGHT_MODEL_BASE_URL,
  MIDSCENE_INSIGHT_MODEL_API_KEY,
  MIDSCENE_INSIGHT_MODEL_INIT_CONFIG_JSON,
  MIDSCENE_INSIGHT_MODEL_TIMEOUT,
  MIDSCENE_INSIGHT_MODEL_TEMPERATURE,
  // PLANNING
  MIDSCENE_PLANNING_MODEL_NAME,
  MIDSCENE_PLANNING_MODEL_SOCKS_PROXY,
  MIDSCENE_PLANNING_MODEL_HTTP_PROXY,
  MIDSCENE_PLANNING_MODEL_BASE_URL,
  MIDSCENE_PLANNING_MODEL_API_KEY,
  MIDSCENE_PLANNING_MODEL_INIT_CONFIG_JSON,
  MIDSCENE_PLANNING_MODEL_TIMEOUT,
  MIDSCENE_PLANNING_MODEL_TEMPERATURE,
  MIDSCENE_MODEL_FAMILY,
] as const;

export const ALL_ENV_KEYS = [
  ...UNUSED_ENV_KEYS,
  ...BASIC_ENV_KEYS,
  ...GLOBAL_ENV_KEYS,
  ...MODEL_ENV_KEYS,
] as const;

export type TEnvKeys = (typeof ALL_ENV_KEYS)[number];
export type TGlobalConfig = Record<TEnvKeys, string | undefined>;

export type TVlModeValues =
  | 'qwen2.5-vl'
  | 'qwen3-vl'
  | 'doubao-vision'
  | 'gemini'
  | 'vlm-ui-tars'
  | 'vlm-ui-tars-doubao'
  | 'vlm-ui-tars-doubao-1.5';

export type TVlModeTypes =
  | 'qwen2.5-vl'
  | 'qwen3-vl'
  | 'doubao-vision'
  | 'gemini'
  | 'vlm-ui-tars';

export const VL_MODE_RAW_VALID_VALUES: TVlModeValues[] = [
  'doubao-vision',
  'gemini',
  'qwen2.5-vl',
  'qwen3-vl',
  'vlm-ui-tars',
  'vlm-ui-tars-doubao',
  'vlm-ui-tars-doubao-1.5',
];

/**
 * Model family values - unified model configuration approach
 * Replaces the old MIDSCENE_USE_* environment variables
 *
 * Note: These values directly correspond to VL_MODE_RAW_VALID_VALUES
 * - 'qwen2.5-vl' is Qwen 2.5
 * - 'qwen3-vl' is Qwen 3
 */
export type TModelFamily = TVlModeValues;

export const MODEL_FAMILY_VALUES: TVlModeValues[] = [
  ...VL_MODE_RAW_VALID_VALUES,
];

export interface IModelConfigForInsight {
  // model name
  [MIDSCENE_INSIGHT_MODEL_NAME]: string;
  // proxy
  [MIDSCENE_INSIGHT_MODEL_SOCKS_PROXY]?: string;
  [MIDSCENE_INSIGHT_MODEL_HTTP_PROXY]?: string;
  // OpenAI
  [MIDSCENE_INSIGHT_MODEL_BASE_URL]?: string;
  [MIDSCENE_INSIGHT_MODEL_API_KEY]?: string;
  [MIDSCENE_INSIGHT_MODEL_INIT_CONFIG_JSON]?: string;
  // timeout
  [MIDSCENE_INSIGHT_MODEL_TIMEOUT]?: string;
  // temperature
  [MIDSCENE_INSIGHT_MODEL_TEMPERATURE]?: string;
}

export interface IModelConfigForPlanning {
  // model name
  [MIDSCENE_PLANNING_MODEL_NAME]: string;
  // proxy
  [MIDSCENE_PLANNING_MODEL_SOCKS_PROXY]?: string;
  [MIDSCENE_PLANNING_MODEL_HTTP_PROXY]?: string;
  // OpenAI
  [MIDSCENE_PLANNING_MODEL_BASE_URL]?: string;
  [MIDSCENE_PLANNING_MODEL_API_KEY]?: string;
  [MIDSCENE_PLANNING_MODEL_INIT_CONFIG_JSON]?: string;
  // timeout
  [MIDSCENE_PLANNING_MODEL_TIMEOUT]?: string;
  // temperature
  [MIDSCENE_PLANNING_MODEL_TEMPERATURE]?: string;
}

/**
 * Model configuration for Planning intent.
 *
 * IMPORTANT: Planning MUST use a vision language model (VL mode).
 * DOM-based planning is not supported.
 *
 * Required: MIDSCENE_MODEL_FAMILY must be set to one of:
 *   - 'qwen2.5-vl'
 *   - 'qwen3-vl'
 *   - 'gemini'
 *   - 'doubao-vision'
 *   - 'vlm-ui-tars'
 *   - 'vlm-ui-tars-doubao'
 *   - 'vlm-ui-tars-doubao-1.5'
 */
export interface IModelConfigForDefault {
  // model name
  [MIDSCENE_MODEL_NAME]: string;
  // proxy
  [MIDSCENE_MODEL_SOCKS_PROXY]?: string;
  [MIDSCENE_MODEL_HTTP_PROXY]?: string;
  // OpenAI
  [MIDSCENE_MODEL_BASE_URL]?: string;
  [MIDSCENE_MODEL_API_KEY]?: string;
  [MIDSCENE_MODEL_INIT_CONFIG_JSON]?: string;
  // extra
  [MIDSCENE_MODEL_FAMILY]?: TVlModeValues;
  // temperature
  [MIDSCENE_MODEL_TEMPERATURE]?: string;
}

export interface IModelConfigForDefaultLegacy {
  // model name
  [MIDSCENE_MODEL_NAME]: string;
  // proxy
  [MIDSCENE_OPENAI_SOCKS_PROXY]?: string;
  [MIDSCENE_OPENAI_HTTP_PROXY]?: string;
  // OpenAI
  [OPENAI_BASE_URL]?: string;
  [OPENAI_API_KEY]?: string;
  [MIDSCENE_OPENAI_INIT_CONFIG_JSON]?: string;
}

/**
 * - insight: Visual Question Answering and Visual Grounding (unified)
 * - planning: planning
 * - default: all except insight、planning
 */
export type TIntent = 'insight' | 'planning' | 'default';

/**
 * Env-style model configuration map supplied directly to the agent.
 * Numbers are allowed so callers can pass numeric env values (e.g. limits) without casting.
 */
export type TModelConfig = Record<string, string | number>;

export enum UITarsModelVersion {
  V1_0 = '1.0',
  V1_5 = '1.5',
  DOUBAO_1_5_15B = 'doubao-1.5-15B',
  DOUBAO_1_5_20B = 'doubao-1.5-20B',
}

/**
 * Callback to create custom OpenAI client instance
 * @param config - Resolved model configuration including apiKey, baseURL, modelName, intent, etc.
 * @returns OpenAI client instance (can be wrapped with langsmith, langfuse, etc.)
 *
 * Note: Wrapper functions like langsmith's wrapOpenAI() return the same OpenAI instance
 * with enhanced behavior, so the return type remains compatible with OpenAI.
 *
 * Note: The return type is `any` in the shared package to avoid requiring openai as a dependency.
 * The actual implementation should return an OpenAI instance.
 *
 * @example
 * ```typescript
 * import OpenAI from 'openai';
 * import { wrapOpenAI } from 'langsmith/wrappers';
 *
 * createOpenAIClient: async (openai, opts) => {
 *   // Wrap with langsmith for planning tasks
 *   if (opts.baseURL?.includes('planning')) {
 *     return wrapOpenAI(openai, { metadata: { task: 'planning' } });
 *   }
 *
 *   return openai;
 * }
 * ```
 */
export type CreateOpenAIClientFn = (
  openAIInstance: any,
  options: Record<string, unknown>,
) => Promise<any>; // OpenAI instance, but typed as `any` to avoid dependency

export interface IModelConfig {
  /**
   * proxy
   */
  socksProxy?: string;
  httpProxy?: string;
  /**
   * model
   */
  modelName: string;
  /**
   * OpenAI
   */
  openaiBaseURL?: string;
  openaiApiKey?: string;
  openaiExtraConfig?: Record<string, unknown>;
  /**
   * Timeout for API calls in milliseconds.
   * If not set, uses OpenAI SDK default (10 minutes).
   */
  timeout?: number;
  /**
   * Temperature for model sampling.
   */
  temperature?: number;
  /**
   * - vlModeRaw: exists only in non-legacy logic. value can be 'doubao-vision', 'gemini', 'qwen2.5-vl', 'vlm-ui-tars', 'vlm-ui-tars-doubao', 'vlm-ui-tars-doubao-1.5'
   * - vlMode: based on the results of the vlModoRaw classification，value can be 'doubao-vision', 'gemini', 'qwen2.5-vl', 'vlm-ui-tars'
   */
  vlModeRaw?: string;
  vlMode?: TVlModeTypes;
  uiTarsModelVersion?: UITarsModelVersion;
  modelDescription: string;
  /**
   * original intent from the config
   */
  intent: TIntent;
  /**
   * Custom OpenAI client factory function
   *
   * If provided, this function will be called to create OpenAI client instances
   * for each AI call, allowing you to:
   * - Wrap clients with observability tools (langsmith, langfuse)
   * - Use custom OpenAI-compatible clients
   * - Apply different configurations based on intent
   */
  createOpenAIClient?: CreateOpenAIClientFn;
}
