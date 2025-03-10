// config keys
export const MIDSCENE_OPENAI_INIT_CONFIG_JSON =
  'MIDSCENE_OPENAI_INIT_CONFIG_JSON';
export const MIDSCENE_MODEL_NAME = 'MIDSCENE_MODEL_NAME';
export const MIDSCENE_LANGSMITH_DEBUG = 'MIDSCENE_LANGSMITH_DEBUG';
export const MIDSCENE_DEBUG_AI_PROFILE = 'MIDSCENE_DEBUG_AI_PROFILE';
export const MIDSCENE_DEBUG_AI_RESPONSE = 'MIDSCENE_DEBUG_AI_RESPONSE';
export const MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG =
  'MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG';
export const MIDSCENE_DEBUG_MODE = 'MIDSCENE_DEBUG_MODE';
export const MIDSCENE_OPENAI_SOCKS_PROXY = 'MIDSCENE_OPENAI_SOCKS_PROXY';
export const OPENAI_API_KEY = 'OPENAI_API_KEY';
export const OPENAI_BASE_URL = 'OPENAI_BASE_URL';
export const OPENAI_MAX_TOKENS = 'OPENAI_MAX_TOKENS';

export const MIDSCENE_CACHE = 'MIDSCENE_CACHE';
export const MIDSCENE_USE_VLM_UI_TARS = 'MIDSCENE_USE_VLM_UI_TARS';
export const MIDSCENE_USE_QWEN_VL = 'MIDSCENE_USE_QWEN_VL';
export const MATCH_BY_POSITION = 'MATCH_BY_POSITION';
export const MIDSCENE_API_TYPE = 'MIDSCENE-API-TYPE';
export const MIDSCENE_REPORT_TAG_NAME = 'MIDSCENE_REPORT_TAG_NAME';

export const MIDSCENE_USE_AZURE_OPENAI = 'MIDSCENE_USE_AZURE_OPENAI';
export const MIDSCENE_AZURE_OPENAI_SCOPE = 'MIDSCENE_AZURE_OPENAI_SCOPE';
export const MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON =
  'MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON';

export const AZURE_OPENAI_ENDPOINT = 'AZURE_OPENAI_ENDPOINT';
export const AZURE_OPENAI_KEY = 'AZURE_OPENAI_KEY';
export const AZURE_OPENAI_API_VERSION = 'AZURE_OPENAI_API_VERSION';
export const AZURE_OPENAI_DEPLOYMENT = 'AZURE_OPENAI_DEPLOYMENT';

export const MIDSCENE_USE_ANTHROPIC_SDK = 'MIDSCENE_USE_ANTHROPIC_SDK';
export const ANTHROPIC_API_KEY = 'ANTHROPIC_API_KEY';

// @deprecated
export const OPENAI_USE_AZURE = 'OPENAI_USE_AZURE';

const allConfigFromEnv = () => {
  return {
    [MIDSCENE_OPENAI_INIT_CONFIG_JSON]:
      process.env[MIDSCENE_OPENAI_INIT_CONFIG_JSON] || undefined,
    [MIDSCENE_MODEL_NAME]: process.env[MIDSCENE_MODEL_NAME] || undefined,
    [MIDSCENE_DEBUG_MODE]: process.env[MIDSCENE_DEBUG_MODE] || undefined,
    [MIDSCENE_LANGSMITH_DEBUG]:
      process.env[MIDSCENE_LANGSMITH_DEBUG] || undefined,
    [MIDSCENE_DEBUG_AI_PROFILE]:
      process.env[MIDSCENE_DEBUG_AI_PROFILE] || undefined,
    [MIDSCENE_DEBUG_AI_RESPONSE]:
      process.env[MIDSCENE_DEBUG_AI_RESPONSE] || undefined,
    [MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG]:
      process.env[MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG] || undefined,
    [OPENAI_API_KEY]: process.env[OPENAI_API_KEY] || undefined,
    [OPENAI_BASE_URL]: process.env[OPENAI_BASE_URL] || undefined,
    [OPENAI_MAX_TOKENS]: process.env[OPENAI_MAX_TOKENS] || undefined,
    [OPENAI_USE_AZURE]: process.env[OPENAI_USE_AZURE] || undefined,
    [MIDSCENE_CACHE]: process.env[MIDSCENE_CACHE] || undefined,
    [MATCH_BY_POSITION]: process.env[MATCH_BY_POSITION] || undefined,
    [MIDSCENE_REPORT_TAG_NAME]:
      process.env[MIDSCENE_REPORT_TAG_NAME] || undefined,
    [MIDSCENE_OPENAI_SOCKS_PROXY]:
      process.env[MIDSCENE_OPENAI_SOCKS_PROXY] || undefined,
    [MIDSCENE_USE_AZURE_OPENAI]:
      process.env[MIDSCENE_USE_AZURE_OPENAI] || undefined,
    [MIDSCENE_AZURE_OPENAI_SCOPE]:
      process.env[MIDSCENE_AZURE_OPENAI_SCOPE] || undefined,
    [MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON]:
      process.env[MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON] || undefined,
    [MIDSCENE_USE_ANTHROPIC_SDK]:
      process.env[MIDSCENE_USE_ANTHROPIC_SDK] || undefined,
    [MIDSCENE_USE_VLM_UI_TARS]:
      process.env[MIDSCENE_USE_VLM_UI_TARS] || undefined,
    [MIDSCENE_USE_QWEN_VL]: process.env[MIDSCENE_USE_QWEN_VL] || undefined,
    [ANTHROPIC_API_KEY]: process.env[ANTHROPIC_API_KEY] || undefined,
    [AZURE_OPENAI_ENDPOINT]: process.env[AZURE_OPENAI_ENDPOINT] || undefined,
    [AZURE_OPENAI_KEY]: process.env[AZURE_OPENAI_KEY] || undefined,
    [AZURE_OPENAI_API_VERSION]:
      process.env[AZURE_OPENAI_API_VERSION] || undefined,
    [AZURE_OPENAI_DEPLOYMENT]:
      process.env[AZURE_OPENAI_DEPLOYMENT] || undefined,
  };
};

let userConfig: ReturnType<typeof allConfigFromEnv> = {} as any;

export const getAIConfig = (
  configKey: keyof typeof userConfig,
): string | undefined => {
  if (configKey === MATCH_BY_POSITION) {
    // currently qwen is considering the same as by_coordinates
    configKey = MIDSCENE_USE_QWEN_VL;
  }

  if (typeof userConfig[configKey] !== 'undefined') {
    return userConfig[configKey]?.trim();
  }
  return allConfigFromEnv()[configKey]?.trim();
};

export const getAIConfigInBoolean = (configKey: keyof typeof userConfig) => {
  const config = getAIConfig(configKey) || '';
  return /^(true|1)$/i.test(config);
};

export const getAIConfigInJson = (configKey: keyof typeof userConfig) => {
  const config = getAIConfig(configKey);
  try {
    return config ? JSON.parse(config) : undefined;
  } catch (error: any) {
    throw new Error(
      `Failed to parse json config: ${configKey}. ${error.message}`,
      {
        cause: error,
      },
    );
  }
};

export const allAIConfig = () => {
  return { ...allConfigFromEnv(), ...userConfig };
};

export const overrideAIConfig = (
  newConfig: ReturnType<typeof allConfigFromEnv>,
  extendMode?: boolean,
) => {
  userConfig = extendMode ? { ...userConfig, ...newConfig } : { ...newConfig };
};
