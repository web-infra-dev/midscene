import {
  ENV_KEYS,
  MATCH_BY_POSITION,
  type TGlobalConfig,
  type TIntent,
  type TModelConfigFn,
} from './types';

const allConfigFromEnv = (): Record<string, string | undefined> => {
  return ENV_KEYS.reduce(
    // biome-ignore lint/performance/noAccumulatingSpread: <explanation>
    (p, name) => ({ ...p, [name]: process.env[name] }),
    Object.create(null) as Record<string, string | undefined>,
  );
};

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

  getAllConfig(): Record<string, string | undefined> {
    const envConfig = allConfigFromEnv();
    if (this.override) {
      const { newConfig, extendMode } = this.override;
      return extendMode ? { ...envConfig, ...newConfig } : { ...newConfig };
    } else {
      return envConfig;
    }
  }

  getConfigValue(key: string) {
    if (key === MATCH_BY_POSITION) {
      throw new Error(
        'MATCH_BY_POSITION is deprecated, use MIDSCENE_USE_VL_MODEL instead',
      );
    }
    const value = this.getAllConfig()[key];
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  }

  getConfigValueInBoolean(key: string): boolean {
    const value = this.getAllConfig()[key];
    if (!value) {
      return false;
    }
    if (/^(true|1)$/i.test(value)) {
      return true;
    }
    if (/^(false|0)$/i.test(value)) {
      return false;
    }
    return !!value.trim();
  }

  getConfigValueInNumber(key: string): number {
    const value = this.getAllConfig()[key];
    return Number(value || '');
  }

  getConfigValueInJson(key: string) {
    const config = this.getConfigValue(key);
    try {
      return config ? JSON.parse(config) : undefined;
    } catch (error: any) {
      throw new Error(`Failed to parse json config: ${key}. ${error.message}`, {
        cause: error,
      });
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

  getModelConfig(intent: TIntent): {
    hasModelConfigFn: boolean;
    result: Record<string, string> | undefined;
  } {
    if (this.modelConfigFn) {
      const result = this.modelConfigFn({ intent }) as unknown as Record<
        string,
        string
      >;
      return {
        hasModelConfigFn: true,
        result,
      };
    }
    return {
      hasModelConfigFn: false,
      result: undefined,
    };
  }

  registerModelConfigFn(modelConfigFn?: TModelConfigFn) {
    if (typeof modelConfigFn !== 'function') {
      throw new Error(
        `modelConfigFn must be a function when registerModelConfigFn, but got with type ${typeof modelConfigFn}`,
      );
    }
    this.modelConfigFn = modelConfigFn;
  }
}

export const globalConfigManger = new GlobalConfigManager();
