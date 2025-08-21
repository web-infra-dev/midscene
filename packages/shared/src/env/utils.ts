import { globalConfigManger } from './global-config';
import { decideModelConfig } from './model-config';
import type { UITarsModelVersion } from './parse';
import {
  type IModelPreferences,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_PREFERRED_LANGUAGE,
  type TEnvKeys,
  type TGlobalConfig,
  type TVlModeTypes,
} from './types';

export const uiTarsModelVersion = (
  modelPreferences: IModelPreferences,
): UITarsModelVersion | undefined => {
  const { uiTarsVersion } = decideModelConfig(modelPreferences, false);
  return uiTarsVersion;
};

export const vlLocateMode = (
  modelPreferences: IModelPreferences,
): TVlModeTypes | undefined => {
  const { vlMode } = decideModelConfig(modelPreferences, false);
  return vlMode as TVlModeTypes;
};

export const getIsUseQwenVl = (modelPreferences: IModelPreferences) => {
  const modelConfig = decideModelConfig(modelPreferences, false);
  return modelConfig.vlMode === 'qwen-vl';
};

export function getModelName(modelPreferences: IModelPreferences) {
  const modelConfig = decideModelConfig(modelPreferences, false);
  return modelConfig.modelName;
}

export const getPreferredLanguage = () => {
  const prefer = globalConfigManger.getConfigValue(MIDSCENE_PREFERRED_LANGUAGE);
  if (prefer) {
    return prefer;
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isChina = timeZone === 'Asia/Shanghai';
  return isChina ? 'Chinese' : 'English';
};

export const getUploadTestServerUrl = (): string => {
  const extraConfig = globalConfigManger.getConfigValueInJson(
    MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  );
  const serverUrl = extraConfig?.REPORT_SERVER_URL;
  return serverUrl;
};

export const getAIConfig = (configKey: TEnvKeys): string | undefined => {
  return globalConfigManger.getConfigValue(configKey);
};

export const getAIConfigInBoolean = (configKey: TEnvKeys) => {
  return globalConfigManger.getConfigValueInBoolean(configKey);
};

export const getAIConfigInNumber = (configKey: TEnvKeys) => {
  return globalConfigManger.getConfigValueInNumber(configKey);
};

export const overrideAIConfig = (
  newConfig: Partial<TGlobalConfig>,
  extendMode = false, // true: merge with global config, false: override global config
) => {
  for (const key in newConfig) {
    if (typeof key !== 'string') {
      throw new Error(`Failed to override AI config, invalid key: ${key}`);
    }
    const value = newConfig[key as keyof typeof newConfig];
    if (typeof value !== 'string') {
      throw new Error(
        `Failed to override AI config, value for key ${key} must be a string, but got with type ${typeof value}`,
      );
    }
  }
  globalConfigManger.registerOverride(newConfig, extendMode);
};
