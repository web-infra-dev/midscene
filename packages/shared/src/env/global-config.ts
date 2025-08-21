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

  private modelConfigByIntent: Record<
    TIntent,
    ReturnType<TModelConfigFn> | undefined
  >;

  constructor() {
    this.modelConfigByIntent = {
      VQA: undefined,
      default: undefined,
      grounding: undefined,
      planning: undefined,
    };
  }

  // just for unit test
  reset() {
    this.override = undefined;
    this.modelConfigByIntent = {
      VQA: undefined,
      default: undefined,
      grounding: undefined,
      planning: undefined,
    };
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

  getModelConfigFromFn(
    intent: TIntent,
  ): ReturnType<TModelConfigFn> | undefined {
    return this.modelConfigByIntent[intent];
  }

  registerModelConfigFn(modelConfigFn?: TModelConfigFn) {
    if (typeof modelConfigFn !== 'function') {
      throw new Error(
        `modelConfigFn must be a function when registerModelConfigFn, but got with type ${typeof modelConfigFn}`,
      );
    }
    const intents: TIntent[] = ['VQA', 'default', 'grounding', 'planning'];

    for (const i of intents) {
      const result = modelConfigFn({ intent: i });
      if (!result) {
        throw new Error(
          `The agent has an option named modelConfig is a function, but it return ${result} when call with intent ${i}, which should be a object.`,
        );
      }
      this.modelConfigByIntent[i] = result;
    }
  }
}

export const globalConfigManger = new GlobalConfigManager();
