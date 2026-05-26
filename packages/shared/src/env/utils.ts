import { GlobalConfigManager } from './global-config-manager';
import { ModelConfigManager } from './model-config-manager';
import {
  type GLOBAL_ENV_KEYS,
  MIDSCENE_PREFERRED_LANGUAGE,
  type MODEL_ENV_KEYS,
} from './types';

export const globalModelConfigManager = new ModelConfigManager();

export const globalConfigManager = new GlobalConfigManager();

globalConfigManager.registerModelConfigManager(globalModelConfigManager);
globalModelConfigManager.registerGlobalConfigManager(globalConfigManager);

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

export const overrideAIConfig = (
  newConfig: Partial<
    Record<
      (typeof GLOBAL_ENV_KEYS)[number] | (typeof MODEL_ENV_KEYS)[number],
      string
    >
  >,
  extendMode = false, // true: merge with global config, false: override global config
) => {
  globalConfigManager.overrideAIConfig(newConfig, extendMode);
};
