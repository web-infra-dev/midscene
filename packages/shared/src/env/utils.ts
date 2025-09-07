import {
  GLOBAL_CONFIG_MANAGER_UNINITIALIZED_FLAG,
  GlobalConfigManager,
} from './global-config';
import type { UITarsModelVersion } from './parse';
import {
  type GLOBAL_ENV_KEYS,
  type IModelPreferences,
  MIDSCENE_PREFERRED_LANGUAGE,
  type MODEL_ENV_KEYS,
  type TVlModeTypes,
} from './types';

export const globalConfigManager = new GlobalConfigManager();

export const getUiTarsModelVersion = (
  modelPreferences: IModelPreferences,
): UITarsModelVersion | undefined => {
  try {
    const result = globalConfigManager.getModelConfigByIntent(
      modelPreferences.intent,
    );
    return result.uiTarsVersion;
  } catch (e) {
    if ((e as any)?.[GLOBAL_CONFIG_MANAGER_UNINITIALIZED_FLAG]) {
      console.warn(
        "Call getUiTarsModelVersion before globalConfig init, will return undefined. This warning should only appear in midscene's own unit tests.",
      );
      return undefined;
    }
    throw e;
  }
};

export const vlLocateMode = (
  modelPreferences: IModelPreferences,
): TVlModeTypes | undefined => {
  try {
    const result = globalConfigManager.getModelConfigByIntent(
      modelPreferences.intent,
    );
    return result.vlMode as TVlModeTypes;
  } catch (e) {
    if ((e as any)?.[GLOBAL_CONFIG_MANAGER_UNINITIALIZED_FLAG]) {
      console.warn(
        "Call vlLocateMode before globalConfig init, will return undefined. This warning should only appear in midscene's own unit tests.",
      );
      return undefined;
    }
    throw e;
  }
};

export const getIsUseQwenVl = (modelPreferences: IModelPreferences) => {
  try {
    const result = globalConfigManager.getModelConfigByIntent(
      modelPreferences.intent,
    );
    return result.vlMode === 'qwen-vl';
  } catch (e) {
    if ((e as any)?.[GLOBAL_CONFIG_MANAGER_UNINITIALIZED_FLAG]) {
      console.warn(
        "Call getIsUseQwenVl before globalConfig init, will return false. This warning should only appear in midscene's own unit tests.",
      );
      return false;
    }
    throw e;
  }
};

export function getModelName(
  modelPreferences: IModelPreferences,
): string | undefined {
  try {
    const result = globalConfigManager.getModelConfigByIntent(
      modelPreferences.intent,
    );
    return result?.modelName;
  } catch (e) {
    if ((e as any)?.[GLOBAL_CONFIG_MANAGER_UNINITIALIZED_FLAG]) {
      console.warn(
        "Call getModelName before globalConfig init, will return undefined. This warning should only appear in midscene's own unit tests.",
      );
      return undefined;
    }
    throw e;
  }
}

export const getPreferredLanguage = () => {
  const prefer = globalConfigManager.getEnvConfigValue(
    MIDSCENE_PREFERRED_LANGUAGE,
  );
  if (prefer) {
    return prefer;
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isChina = timeZone === 'Asia/Shanghai';
  return isChina ? 'Chinese' : 'English';
};

export const getUploadTestServerUrl = (): string | undefined => {
  try {
    const { openaiExtraConfig } =
      globalConfigManager.getModelConfigByIntent('default');
    const serverUrl = openaiExtraConfig?.REPORT_SERVER_URL as string;
    return serverUrl;
  } catch (e) {
    if ((e as any)?.[GLOBAL_CONFIG_MANAGER_UNINITIALIZED_FLAG]) {
      console.warn(
        "Call getUploadTestServerUrl before globalConfig init, will return undefined. This warning should only appear in midscene's own unit tests.",
      );
      return undefined;
    }
    throw e;
  }
};

export const overrideAIConfig = (
  newConfig: Partial<
    Record<
      (typeof GLOBAL_ENV_KEYS)[number] | (typeof MODEL_ENV_KEYS)[number],
      string
    >
  >,
  extendMode = false, // true: merge with global config, false: override global config
) => {
  globalConfigManager.registerOverride(newConfig, extendMode);
};
