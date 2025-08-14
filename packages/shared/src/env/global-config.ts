import type { TGlobalConfig, TIntent, TModelConfigFn } from './types';
import { allConfigFromEnv } from './utils';

/**
 * Collect global configs from process.env, overrideAIConfig, modelConfig, etc.
 * And provider methods to get merged config value
 */
class GlobalConfigManager {
  private override:
    | {
        newConfig?: Partial<TGlobalConfig>;
        extendMode?: boolean;
      }
    | undefined;

  private modelConfigFn?: TModelConfigFn;

  // just for unit test
  reset() {
    this.override = undefined;
    this.modelConfigFn = undefined;
  }

  getConfig() {
    const envConfig = allConfigFromEnv();
    if (this.override) {
      const { newConfig, extendMode } = this.override;
      return extendMode ? { ...envConfig, ...newConfig } : { ...newConfig };
    } else {
      return envConfig;
    }
  }

  registerOverride(
    newConfig: Partial<TGlobalConfig>,
    extendMode = false, // true: merge with global config, false: override global config
  ) {
    const savedNewConfig = extendMode
      ? {
          ...this.override?.newConfig,
          ...newConfig,
        }
      : newConfig;

    this.override = {
      newConfig: savedNewConfig,
      extendMode,
    };
  }

  getModelConfig(intent?: TIntent): ReturnType<TModelConfigFn> {
    if (this.modelConfigFn) {
      return this.modelConfigFn({ intent });
    }
    return {} as ReturnType<TModelConfigFn>;
  }

  registerModelConfigFn(modelConfigFn: TModelConfigFn) {
    this.modelConfigFn = modelConfigFn;
  }
}

export const globalConfigManger = new GlobalConfigManager();
