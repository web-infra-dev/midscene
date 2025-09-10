import { getDebug } from '../logger';
import { initDebugConfig } from './init-debug';
import type { ModelConfigManager } from './model-config-manager';
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
} from './types';

/**
 * Collect global configs from process.env, overrideAIConfig, etc.
 * And provider methods to get merged config value
 */
export class GlobalConfigManager {
  private override:
    | {
        newConfig?: Partial<TGlobalConfig>;
        extendMode?: boolean;
      }
    | undefined;

  private keysHaveBeenRead: Record<string, boolean> = {};

  private globalModelConfigManager: ModelConfigManager | undefined = undefined;

  constructor() {
    initDebugConfig();
  }

  /**
   * recalculate allEnvConfig every time because process.env can be updated any time
   */
  public getAllEnvConfig() {
    const envConfig = ALL_ENV_KEYS.reduce(
      (p, name) => {
        p[name] = process.env[name];
        return p;
      },
      Object.create(null) as Record<string, string | undefined>,
    );

    if (this.override) {
      const { newConfig, extendMode } = this.override;
      if (extendMode) {
        return { ...envConfig, ...newConfig };
      } else {
        return { ...newConfig };
      }
    } else {
      return envConfig;
    }
  }

  getEnvConfigValue(key: (typeof STRING_ENV_KEYS)[number]) {
    const allConfig = this.getAllEnvConfig();

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
    const allConfig = this.getAllEnvConfig();

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
    const allConfig = this.getAllEnvConfig();

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

  registerModelConfigManager(globalModelConfigManager: ModelConfigManager) {
    this.globalModelConfigManager = globalModelConfigManager;
  }

  /**
   * for overrideAIConfig
   * can only override keys in MODEL_ENV_KEYS
   */
  overrideAIConfig(
    newConfig: Partial<
      Record<
        (typeof GLOBAL_ENV_KEYS)[number] | (typeof MODEL_ENV_KEYS)[number],
        string
      >
    >,
    extendMode = false, // true: merge with global config, false: override global config
  ) {
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

    if (!this.globalModelConfigManager) {
      throw new Error(
        'globalModelConfigManager is not registered, which should not happen',
      );
    }
    this.globalModelConfigManager.clearModelConfigMap();
  }
}
