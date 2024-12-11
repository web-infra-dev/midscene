// config keys
export const MIDSCENE_OPENAI_INIT_CONFIG_JSON =
  'MIDSCENE_OPENAI_INIT_CONFIG_JSON';
export const MIDSCENE_MODEL_NAME = 'MIDSCENE_MODEL_NAME';
export const MIDSCENE_LANGSMITH_DEBUG = 'MIDSCENE_LANGSMITH_DEBUG';
export const MIDSCENE_DEBUG_AI_PROFILE = 'MIDSCENE_DEBUG_AI_PROFILE';
export const MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG =
  'MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG';
export const MIDSCENE_DEBUG_MODE = 'MIDSCENE_DEBUG_MODE';
export const OPENAI_API_KEY = 'OPENAI_API_KEY';
export const OPENAI_BASE_URL = 'OPENAI_BASE_URL';
export const MIDSCENE_MODEL_TEXT_ONLY = 'MIDSCENE_MODEL_TEXT_ONLY';
export const OPENAI_USE_AZURE = 'OPENAI_USE_AZURE';
export const MIDSCENE_CACHE = 'MIDSCENE_CACHE';
export const MATCH_BY_POSITION = 'MATCH_BY_POSITION';
export const MIDSCENE_REPORT_TAG_NAME = 'MIDSCENE_REPORT_TAG_NAME';
export const MATCH_BY_TAG_NUMBER = 'MATCH_BY_TAG_NUMBER';
export const MIDSCENE_COOKIE = 'MIDSCENE_COOKIE';

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
    [MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG]:
      process.env[MIDSCENE_DANGEROUSLY_PRINT_ALL_CONFIG] || undefined,
    [OPENAI_API_KEY]: process.env[OPENAI_API_KEY] || undefined,
    [OPENAI_BASE_URL]: process.env[OPENAI_BASE_URL] || undefined,
    [MIDSCENE_MODEL_TEXT_ONLY]:
      process.env[MIDSCENE_MODEL_TEXT_ONLY] || undefined,
    [OPENAI_USE_AZURE]: process.env[OPENAI_USE_AZURE] || undefined,
    [MIDSCENE_CACHE]: process.env[MIDSCENE_CACHE] || undefined,
    [MATCH_BY_POSITION]: process.env[MATCH_BY_POSITION] || undefined,
    [MIDSCENE_REPORT_TAG_NAME]:
      process.env[MIDSCENE_REPORT_TAG_NAME] || undefined,
    [MATCH_BY_TAG_NUMBER]: process.env[MATCH_BY_TAG_NUMBER] || undefined,
    [MIDSCENE_COOKIE]: process.env[MIDSCENE_COOKIE] || undefined,
  };
};

let userConfig: ReturnType<typeof allConfigFromEnv> = {} as any;

export const getAIConfig = (
  configKey: keyof typeof userConfig,
): string | undefined => {
  if (typeof userConfig[configKey] !== 'undefined') {
    return userConfig[configKey];
  }
  return allConfigFromEnv()[configKey];
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
