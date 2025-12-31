import {
  MIDSCENE_INSIGHT_MODEL_API_KEY,
  MIDSCENE_INSIGHT_MODEL_BASE_URL,
  MIDSCENE_INSIGHT_MODEL_HTTP_PROXY,
  MIDSCENE_INSIGHT_MODEL_INIT_CONFIG_JSON,
  MIDSCENE_INSIGHT_MODEL_NAME,
  MIDSCENE_INSIGHT_MODEL_SOCKS_PROXY,
  MIDSCENE_INSIGHT_MODEL_TEMPERATURE,
  MIDSCENE_INSIGHT_MODEL_TIMEOUT,
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_HTTP_PROXY,
  MIDSCENE_MODEL_INIT_CONFIG_JSON,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_MODEL_SOCKS_PROXY,
  MIDSCENE_MODEL_TEMPERATURE,
  MIDSCENE_MODEL_TIMEOUT,
  MIDSCENE_OPENAI_HTTP_PROXY,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_OPENAI_SOCKS_PROXY,
  MIDSCENE_PLANNING_MODEL_API_KEY,
  MIDSCENE_PLANNING_MODEL_BASE_URL,
  MIDSCENE_PLANNING_MODEL_HTTP_PROXY,
  MIDSCENE_PLANNING_MODEL_INIT_CONFIG_JSON,
  MIDSCENE_PLANNING_MODEL_NAME,
  MIDSCENE_PLANNING_MODEL_SOCKS_PROXY,
  MIDSCENE_PLANNING_MODEL_TEMPERATURE,
  MIDSCENE_PLANNING_MODEL_TIMEOUT,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from './types';

interface IModelConfigKeys {
  modelName: string;
  /**
   * proxy
   */
  socksProxy: string;
  httpProxy: string;
  /**
   * OpenAI
   */
  openaiBaseURL: string;
  openaiApiKey: string;
  openaiExtraConfig: string;
  /**
   * Extra
   */
  modelFamily: string;
  /**
   * Timeout
   */
  timeout: string;
  /**
   * Temperature
   */
  temperature: string;
}

export const INSIGHT_MODEL_CONFIG_KEYS: IModelConfigKeys = {
  modelName: MIDSCENE_INSIGHT_MODEL_NAME,
  /**
   * proxy
   */
  socksProxy: MIDSCENE_INSIGHT_MODEL_SOCKS_PROXY,
  httpProxy: MIDSCENE_INSIGHT_MODEL_HTTP_PROXY,
  /**
   * OpenAI
   */
  openaiBaseURL: MIDSCENE_INSIGHT_MODEL_BASE_URL,
  openaiApiKey: MIDSCENE_INSIGHT_MODEL_API_KEY,
  openaiExtraConfig: MIDSCENE_INSIGHT_MODEL_INIT_CONFIG_JSON,
  /**
   * Extra
   */
  modelFamily: 'THERE_IS_NO_MODEL_FAMILY_FOR_INSIGHT',
  /**
   * Timeout
   */
  timeout: MIDSCENE_INSIGHT_MODEL_TIMEOUT,
  /**
   * Temperature
   */
  temperature: MIDSCENE_INSIGHT_MODEL_TEMPERATURE,
} as const;

export const PLANNING_MODEL_CONFIG_KEYS: IModelConfigKeys = {
  modelName: MIDSCENE_PLANNING_MODEL_NAME,
  /**
   * proxy
   */
  socksProxy: MIDSCENE_PLANNING_MODEL_SOCKS_PROXY,
  httpProxy: MIDSCENE_PLANNING_MODEL_HTTP_PROXY,
  /**
   * OpenAI
   */
  openaiBaseURL: MIDSCENE_PLANNING_MODEL_BASE_URL,
  openaiApiKey: MIDSCENE_PLANNING_MODEL_API_KEY,
  openaiExtraConfig: MIDSCENE_PLANNING_MODEL_INIT_CONFIG_JSON,
  /**
   * Extra
   */
  modelFamily: 'THERE_IS_NO_MODEL_FAMILY_FOR_PLANNING',
  /**
   * Timeout
   */
  timeout: MIDSCENE_PLANNING_MODEL_TIMEOUT,
  /**
   * Temperature
   */
  temperature: MIDSCENE_PLANNING_MODEL_TEMPERATURE,
} as const;

// modelConfig return default
export const DEFAULT_MODEL_CONFIG_KEYS: IModelConfigKeys = {
  modelName: MIDSCENE_MODEL_NAME,
  /**
   * proxy
   */
  socksProxy: MIDSCENE_MODEL_SOCKS_PROXY,
  httpProxy: MIDSCENE_MODEL_HTTP_PROXY,
  /**
   * OpenAI
   */
  openaiBaseURL: MIDSCENE_MODEL_BASE_URL,
  openaiApiKey: MIDSCENE_MODEL_API_KEY,
  openaiExtraConfig: MIDSCENE_MODEL_INIT_CONFIG_JSON,
  /**
   * Extra
   */
  modelFamily: MIDSCENE_MODEL_FAMILY,
  /**
   * Timeout
   */
  timeout: MIDSCENE_MODEL_TIMEOUT,
  /**
   * Temperature
   */
  temperature: MIDSCENE_MODEL_TEMPERATURE,
} as const;

// read from process.env
export const DEFAULT_MODEL_CONFIG_KEYS_LEGACY: IModelConfigKeys = {
  modelName: MIDSCENE_MODEL_NAME,
  /**
   * proxy - Uses legacy MIDSCENE_OPENAI_* variables for backward compatibility
   */
  socksProxy: MIDSCENE_OPENAI_SOCKS_PROXY,
  httpProxy: MIDSCENE_OPENAI_HTTP_PROXY,
  /**
   * Model API - Uses legacy OPENAI_* variables for backward compatibility
   */
  openaiBaseURL: OPENAI_BASE_URL,
  openaiApiKey: OPENAI_API_KEY,
  openaiExtraConfig: MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  /**
   * Extra
   */
  modelFamily: 'DEFAULT_MODEL_CONFIG_KEYS has no modelFamily key',
  /**
   * Timeout - use the new key for legacy mode too
   */
  timeout: MIDSCENE_MODEL_TIMEOUT,
  /**
   * Temperature - use the new key for legacy mode too
   */
  temperature: MIDSCENE_MODEL_TEMPERATURE,
} as const;
