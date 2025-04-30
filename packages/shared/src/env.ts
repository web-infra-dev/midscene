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
export const MIDSCENE_MCP_USE_PUPPETEER_MODE =
  'MIDSCENE_MCP_USE_PUPPETEER_MODE';

export const MIDSCENE_FORCE_DEEP_THINK = 'MIDSCENE_FORCE_DEEP_THINK';

export const MIDSCENE_OPENAI_SOCKS_PROXY = 'MIDSCENE_OPENAI_SOCKS_PROXY';
export const OPENAI_API_KEY = 'OPENAI_API_KEY';
export const OPENAI_BASE_URL = 'OPENAI_BASE_URL';
export const OPENAI_MAX_TOKENS = 'OPENAI_MAX_TOKENS';

export const MIDSCENE_ADB_PATH = 'MIDSCENE_ADB_PATH';

export const MIDSCENE_CACHE = 'MIDSCENE_CACHE';
export const MIDSCENE_USE_VLM_UI_TARS = 'MIDSCENE_USE_VLM_UI_TARS';
export const MIDSCENE_USE_QWEN_VL = 'MIDSCENE_USE_QWEN_VL';
export const MIDSCENE_USE_DOUBAO_VISION = 'MIDSCENE_USE_DOUBAO_VISION';
export const MIDSCENE_USE_GEMINI = 'MIDSCENE_USE_GEMINI';
export const MIDSCENE_USE_VL_MODEL = 'MIDSCENE_USE_VL_MODEL';
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

export const MIDSCENE_RUN_DIR = 'MIDSCENE_RUN_DIR';

// @deprecated
export const OPENAI_USE_AZURE = 'OPENAI_USE_AZURE';

export const allConfigFromEnv = () => {
  return {
    [MIDSCENE_OPENAI_INIT_CONFIG_JSON]:
      process.env[MIDSCENE_OPENAI_INIT_CONFIG_JSON] || undefined,
    [MIDSCENE_MODEL_NAME]: process.env[MIDSCENE_MODEL_NAME] || undefined,
    [MIDSCENE_DEBUG_MODE]: process.env[MIDSCENE_DEBUG_MODE] || undefined,
    [MIDSCENE_FORCE_DEEP_THINK]:
      process.env[MIDSCENE_FORCE_DEEP_THINK] || undefined,
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
    [MIDSCENE_ADB_PATH]: process.env[MIDSCENE_ADB_PATH] || undefined,
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
    [MIDSCENE_USE_DOUBAO_VISION]:
      process.env[MIDSCENE_USE_DOUBAO_VISION] || undefined,
    [MIDSCENE_USE_GEMINI]: process.env[MIDSCENE_USE_GEMINI] || undefined,
    [MIDSCENE_USE_VL_MODEL]: process.env[MIDSCENE_USE_VL_MODEL] || undefined,
    [ANTHROPIC_API_KEY]: process.env[ANTHROPIC_API_KEY] || undefined,
    [AZURE_OPENAI_ENDPOINT]: process.env[AZURE_OPENAI_ENDPOINT] || undefined,
    [AZURE_OPENAI_KEY]: process.env[AZURE_OPENAI_KEY] || undefined,
    [AZURE_OPENAI_API_VERSION]:
      process.env[AZURE_OPENAI_API_VERSION] || undefined,
    [AZURE_OPENAI_DEPLOYMENT]:
      process.env[AZURE_OPENAI_DEPLOYMENT] || undefined,
    [MIDSCENE_MCP_USE_PUPPETEER_MODE]:
      process.env[MIDSCENE_MCP_USE_PUPPETEER_MODE] || undefined,
    [MIDSCENE_RUN_DIR]: process.env[MIDSCENE_RUN_DIR] || undefined,
  };
};

let globalConfig: Partial<ReturnType<typeof allConfigFromEnv>> | null = null;

const getGlobalConfig = () => {
  if (globalConfig === null) {
    globalConfig = allConfigFromEnv();
  }
  return globalConfig;
};

// import { UITarsModelVersion } from '@ui-tars/shared/constants';
export enum UITarsModelVersion {
  V1_0 = '1.0',
  V1_5 = '1.5',
  DOUBAO_1_5_15B = 'doubao-1.5-15B',
  DOUBAO_1_5_20B = 'doubao-1.5-20B',
}

export const uiTarsModelVersion = (): UITarsModelVersion | false => {
  if (vlLocateMode() !== 'vlm-ui-tars') {
    return false;
  }

  const versionConfig: any = getAIConfig(MIDSCENE_USE_VLM_UI_TARS);
  if (versionConfig === '1' || versionConfig === 1) {
    return UITarsModelVersion.V1_0;
  }
  if (versionConfig === 'DOUBAO' || versionConfig === 'DOUBAO-1.5') {
    return UITarsModelVersion.DOUBAO_1_5_20B;
  }
  return `${versionConfig}` as UITarsModelVersion;
};

export const vlLocateMode = ():
  | 'qwen-vl'
  | 'doubao-vision'
  | 'gemini'
  | 'vl-model' // not actually in use
  | 'vlm-ui-tars'
  | false => {
  const enabledModes = [
    getAIConfigInBoolean(MIDSCENE_USE_DOUBAO_VISION) &&
      'MIDSCENE_USE_DOUBAO_VISION',
    getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL) && 'MIDSCENE_USE_QWEN_VL',
    getAIConfigInBoolean(MIDSCENE_USE_VLM_UI_TARS) &&
      'MIDSCENE_USE_VLM_UI_TARS',
    getAIConfigInBoolean(MIDSCENE_USE_GEMINI) && 'MIDSCENE_USE_GEMINI',
  ].filter(Boolean);

  if (enabledModes.length > 1) {
    throw new Error(
      `Only one vision mode can be enabled at a time. Currently enabled modes: ${enabledModes.join(', ')}. Please disable all but one mode.`,
    );
  }

  if (getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)) {
    return 'qwen-vl';
  }

  if (getAIConfigInBoolean(MIDSCENE_USE_DOUBAO_VISION)) {
    return 'doubao-vision';
  }

  if (getAIConfigInBoolean(MIDSCENE_USE_GEMINI)) {
    return 'gemini';
  }

  if (getAIConfigInBoolean(MIDSCENE_USE_VL_MODEL)) {
    return 'vl-model';
  }

  if (getAIConfigInBoolean(MIDSCENE_USE_VLM_UI_TARS)) {
    return 'vlm-ui-tars';
  }

  return false;
};

export const getAIConfig = (
  configKey: keyof ReturnType<typeof allConfigFromEnv>,
): string | undefined => {
  if (configKey === MATCH_BY_POSITION) {
    throw new Error(
      'MATCH_BY_POSITION is deprecated, use MIDSCENE_USE_VL_MODEL instead',
    );
  }

  return getGlobalConfig()[configKey]?.trim();
};

export const getAIConfigInBoolean = (
  configKey: keyof ReturnType<typeof allConfigFromEnv>,
) => {
  const config = getAIConfig(configKey) || '';
  if (/^(true|1)$/i.test(config)) {
    return true;
  }
  if (/^(false|0)$/i.test(config)) {
    return false;
  }
  return !!config.trim();
};

export const getAIConfigInJson = (
  configKey: keyof ReturnType<typeof allConfigFromEnv>,
) => {
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

export const overrideAIConfig = (
  newConfig: Partial<ReturnType<typeof allConfigFromEnv>>,
  extendMode = false, // true: merge with global config, false: override global config
) => {
  for (const key in newConfig) {
    if (typeof key !== 'string') {
      throw new Error(`Failed to override AI config, invalid key: ${key}`);
    }
    if (typeof newConfig[key as keyof typeof newConfig] === 'object') {
      throw new Error(
        `Failed to override AI config, invalid value for key: ${key}, value: ${newConfig[key as keyof typeof newConfig]}`,
      );
    }
  }

  const currentConfig = getGlobalConfig();
  globalConfig = extendMode
    ? { ...currentConfig, ...newConfig }
    : { ...newConfig };
};
