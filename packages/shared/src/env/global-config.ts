import { getDebug } from '../logger';
import { initDebugConfig } from './init-debug';
import { type IModelConfig, decideModelConfig } from './model-config';
import {
  BOOLEAN_ENV_KEYS,
  GLOBAL_ENV_KEYS,
  NUMBER_ENV_KEYS,
  STRING_ENV_KEYS,
} from './types';

import {
  ALL_ENV_KEYS,
  MATCH_BY_POSITION,
  MODEL_ENV_KEYS,
  type TGlobalConfig,
  type TIntent,
  type TModelConfigFn,
} from './types';

const allConfigFromEnv = (): Record<string, string | undefined> => {
  return ALL_ENV_KEYS.reduce(
    // biome-ignore lint/performance/noAccumulatingSpread: <explanation>
    (p, name) => ({ ...p, [name]: process.env[name] }),
    Object.create(null) as Record<string, string | undefined>,
  );
};

export const GLOBAL_CONFIG_MANAGER_UNINITIALIZED_FLAG =
  'GLOBAL_CONFIG_MANAGER_UNINITIALIZED_FLAG';

const ALL_INTENTS: TIntent[] = ['VQA', 'default', 'grounding', 'planning'];
/**
 * Collect global configs from process.env, overrideAIConfig, modelConfig, etc.
 * And provider methods to get merged config value
 */
export class GlobalConfigManager {
  private override:
    | {
        newConfig?: Partial<TGlobalConfig>;
        extendMode?: boolean;
      }
    | undefined;

  private initialized = false;

  private debugLog: (...args: any[]) => void;

  private modelConfigByIntent: Record<TIntent, IModelConfig | undefined> = {
    VQA: undefined,
    default: undefined,
    grounding: undefined,
    planning: undefined,
  };

  private allConfig: Record<string, string | undefined> | undefined = undefined;

  private keysHaveBeenRead: Record<string, boolean> = {};

  private latestModelConfigFn?: TModelConfigFn;

  constructor() {
    initDebugConfig();
    const debugLog = getDebug('ai:global-config');
    this.debugLog = debugLog;
  }

  private initAllEnvConfig() {
    const envConfig = allConfigFromEnv();
    this.allConfig = (() => {
      if (this.override) {
        this.debugLog('initAllConfig with override from overrideAIConfig');
        const { newConfig, extendMode } = this.override;
        if (extendMode) {
          this.debugLog('initAllConfig with extend mode from overrideAIConfig');
          return { ...envConfig, ...newConfig };
        } else {
          this.debugLog(
            'initAllConfig without override mode from overrideAIConfig',
          );
          return { ...newConfig };
        }
      } else {
        this.debugLog('initAllConfig without override from overrideAIConfig');

        return envConfig;
      }
    })();
  }

  private initIntentConfigFromFn() {
    const intentConfigFromFn: Record<
      TIntent,
      ReturnType<TModelConfigFn> | undefined
    > = {
      VQA: undefined,
      default: undefined,
      grounding: undefined,
      planning: undefined,
    };

    if (this.latestModelConfigFn) {
      for (const i of ALL_INTENTS) {
        const result = this.latestModelConfigFn({ intent: i });
        if (!result) {
          throw new Error(
            `The agent has an option named modelConfig is a function, but it return ${result} when call with intent ${i}, which should be a object.`,
          );
        }
        intentConfigFromFn[i] = result;
      }
    }
    return intentConfigFromFn;
  }

  private createUninitializedError(message: string) {
    const error = new Error(message);
    (error as any)[GLOBAL_CONFIG_MANAGER_UNINITIALIZED_FLAG] = true;
    return error;
  }

  reset() {
    console.warn(
      'globalConfigManager.reset should only be called in Midscene owner unit test',
    );
    this.initialized = false;
    this.override = undefined;
    this.allConfig = undefined;
    this.keysHaveBeenRead = {};
    this.modelConfigByIntent = {
      VQA: undefined,
      default: undefined,
      grounding: undefined,
      planning: undefined,
    };
  }
  private initModelConfigForIntent() {
    // init all config
    this.initAllEnvConfig();
    // get config from agent.modelConfig()
    const intentConfigFromFn = this.initIntentConfigFromFn();
    // decide model config
    for (const i of ALL_INTENTS) {
      const result = decideModelConfig({
        intent: i,
        allConfig: this.allConfig!,
        modelConfigFromFn: intentConfigFromFn[i] as unknown as
          | Record<string, string | undefined>
          | undefined,
      });
      this.modelConfigByIntent[i] = result;
    }
  }

  /**
   * init and decide all global config value,
   * should be called at Agent.constructor
   */
  init(modelConfigFn?: TModelConfigFn) {
    // skip check temporarily because of globalConfigManager will be refactored to support multiple agents
    // if (this.initialized) {
    //   throw new Error('GlobalConfigManager.init should be called only once');
    // }

    this.latestModelConfigFn = modelConfigFn;

    this.initModelConfigForIntent();

    this.initialized = true;
  }

  getModelConfigByIntent(intent: TIntent) {
    this.debugLog(
      `globalConfigManager is not initialized when call getModelConfigByIntent with intent ${intent}`,
    );
    // if (!this.initialized) {
    //   throw this.createUninitializedError(
    //     `globalConfigManager is not initialized when call getModelConfigByIntent with intent ${intent}`,
    //   );
    // }
    return this.modelConfigByIntent[intent]!;
  }

  getEnvConfigValue(key: (typeof STRING_ENV_KEYS)[number]) {
    const allConfig = this.allConfig || process.env;

    if (!STRING_ENV_KEYS.includes(key)) {
      throw new Error(`getEnvConfigValue with key ${key} is not supported.`);
    }
    if (key === MATCH_BY_POSITION) {
      throw new Error(
        'MATCH_BY_POSITION is deprecated, use MIDSCENE_USE_VL_MODEL instead',
      );
    }
    const value = allConfig[key];
    this.keysHaveBeenRead[key] = true;
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  }

  /**
   * read number only from process.env
   */
  getEnvConfigInNumber(key: (typeof NUMBER_ENV_KEYS)[number]): number {
    const allConfig = this.allConfig || process.env;
    if (!NUMBER_ENV_KEYS.includes(key)) {
      throw new Error(`getEnvConfigInNumber with key ${key} is not supported`);
    }
    const value = allConfig[key];
    this.keysHaveBeenRead[key] = true;
    return Number(value || '');
  }

  /**
   * read boolean only from process.env
   */
  getEnvConfigInBoolean(key: (typeof BOOLEAN_ENV_KEYS)[number]): boolean {
    const allConfig = this.allConfig || process.env;

    if (!BOOLEAN_ENV_KEYS.includes(key)) {
      throw new Error(`getEnvConfigInBoolean with key ${key} is not supported`);
    }

    const value = allConfig[key];
    this.keysHaveBeenRead[key] = true;

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

  /**
   * for overrideAIConfig
   * can only override keys in MODEL_ENV_KEYS
   */
  registerOverride(
    newConfig: Partial<
      Record<
        (typeof GLOBAL_ENV_KEYS)[number] | (typeof MODEL_ENV_KEYS)[number],
        string
      >
    >,
    extendMode = false, // true: merge with global config, false: override global config
  ) {
    // skip check temporarily because of globalConfigManager will be refactored to support multiple agents
    // if (this.initialized) {
    //   throw new Error(
    //     'overrideAIConfig must be called before Agent.constructor',
    //   );
    // }
    for (const key in newConfig) {
      if (![...GLOBAL_ENV_KEYS, ...MODEL_ENV_KEYS].includes(key as never)) {
        throw new Error(`Failed to override AI config, invalid key: ${key}`);
      }
      const value = newConfig[key as keyof typeof newConfig];
      if (typeof value !== 'string') {
        throw new Error(
          `Failed to override AI config, value for key ${key} must be a string, but got with type ${typeof value}`,
        );
      }
      if (this.keysHaveBeenRead[key]) {
        console.warn(
          `Warning: try to override AI config with key ${key} ,but it has been read.`,
        );
      }
    }
    const savedNewConfig = extendMode
      ? {
          ...this.override?.newConfig,
          ...newConfig,
        }
      : newConfig;

    this.override = {
      newConfig: {
        ...savedNewConfig,
      },
      extendMode,
    };

    // initModelConfigForIntent will throw error if lack model related vars in process.env
    // so call it after initialized
    if (this.initialized) {
      this.initModelConfigForIntent();
    } else {
      this.initAllEnvConfig();
    }
  }
}
