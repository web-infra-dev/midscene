import { globalConfigManger } from './global-config';
import { decideModelConfig } from './model-config';
import {
  type IModelPreferences,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_PREFERRED_LANGUAGE,
  MIDSCENE_USE_VLM_UI_TARS,
  type TEnvKeys,
  type TGlobalConfig,
  type TVlModeNames,
} from './types';

export enum UITarsModelVersion {
  V1_0 = '1.0',
  V1_5 = '1.5',
  DOUBAO_1_5_15B = 'doubao-1.5-15B',
  DOUBAO_1_5_20B = 'doubao-1.5-20B',
}

export const uiTarsModelVersion = (
  modelPreferences: IModelPreferences,
): UITarsModelVersion | false => {
  if (vlLocateMode(modelPreferences) !== 'vlm-ui-tars') {
    return false;
  }

  const modelConfig = decideModelConfig(modelPreferences, false);

  const { vlMode } = modelConfig;
  if (modelConfig.from === 'legacy-env') {
    const versionConfig = globalConfigManger.getConfigValue(
      MIDSCENE_USE_VLM_UI_TARS,
    );
    if (versionConfig === '1') {
      return UITarsModelVersion.V1_0;
    }
    if (versionConfig === 'DOUBAO' || versionConfig === 'DOUBAO-1.5') {
      return UITarsModelVersion.DOUBAO_1_5_20B;
    }
    return `${versionConfig}` as UITarsModelVersion;
  } else {
    if (vlMode === 'vlm-ui-tars') {
      return UITarsModelVersion.V1_0;
    }
    if (
      vlMode === 'vlm-ui-tars-doubao' ||
      vlMode === 'vlm-ui-tars-doubao-1.5'
    ) {
      return UITarsModelVersion.DOUBAO_1_5_20B;
    }
    throw new Error(`vlMode ${vlMode} is not a expected value.`);
  }
};

const validModeNames: TVlModeNames[] = [
  'doubao-vision',
  'gemini',
  'qwen-vl',
  'vlm-ui-tars',
  'vlm-ui-tars-doubao',
  'vlm-ui-tars-doubao-1.5',
];

export const vlLocateMode = (
  modelPreferences: IModelPreferences,
): TVlModeNames | false => {
  const modelConfig = decideModelConfig(modelPreferences, false);
  if (modelConfig.vlMode === undefined) {
    return false;
  }
  const { vlMode } = modelConfig;
  if (!validModeNames.includes(vlMode as TVlModeNames)) {
    throw new Error(
      `VL_MODE value ${vlMode} is not a valid VL_MODE value, must be one of ${validModeNames}`,
    );
  }
  if (vlMode === 'vlm-ui-tars-doubao' || vlMode === 'vlm-ui-tars-doubao-1.5') {
    return 'vlm-ui-tars';
  }
  return vlMode as TVlModeNames;
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
