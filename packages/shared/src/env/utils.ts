import { globalConfigManger } from './global-config';
import {
  ENV_KEYS,
  type IModelPreferences,
  MATCH_BY_POSITION,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_PREFERRED_LANGUAGE,
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_GEMINI,
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
  MIDSCENE_USE_VL_MODEL,
} from './types';

export const allConfigFromEnv = () => {
  return ENV_KEYS.reduce(
    // biome-ignore lint/performance/noAccumulatingSpread: <explanation>
    (p, name) => ({ ...p, name: process.env[name] }),
    Object.create(null) as Record<string, string | undefined>,
  );
};

const getGlobalConfig = () => {
  return globalConfigManger.getConfig();
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

  const value = getGlobalConfig()[configKey];
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
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

export const getAIConfigInNumber = (
  configKey: keyof ReturnType<typeof allConfigFromEnv>,
) => {
  const config = getAIConfig(configKey) || '';
  return Number(config);
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
  globalConfigManger.registerOverride(newConfig, extendMode);
};

export const getPreferredLanguage = () => {
  if (getAIConfig(MIDSCENE_PREFERRED_LANGUAGE)) {
    return getAIConfig(MIDSCENE_PREFERRED_LANGUAGE);
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isChina = timeZone === 'Asia/Shanghai';
  return isChina ? 'Chinese' : 'English';
};

export const getIsUseQwenVl = () => {
  return getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL);
};

export const getIsUseVlmUiTars = () => {
  return getAIConfigInBoolean(MIDSCENE_USE_VLM_UI_TARS);
};

export const getUsedModelName = (
  modelPreference:
    | IModelPreferences
    | {
        intent: 'multi';
      },
) => {
  return getAIConfig(MIDSCENE_MODEL_NAME);
};
