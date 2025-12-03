import type { GlobalConfigManager } from './global-config-manager';
import { decideModelConfigFromIntentConfig } from './parse-model-config';

import type {
  CreateOpenAIClientFn,
  IModelConfig,
  TIntent,
  TModelConfig,
} from './types';

export class ModelConfigManager {
  private modelConfigMap: Record<TIntent, IModelConfig> | undefined = undefined;

  private isInitialized = false;

  // once modelConfig is set, isolatedMode will be true
  // modelConfigMap will only depend on provided config and not be affected by process.env
  private isolatedMode = false;

  private globalConfigManager: GlobalConfigManager | undefined = undefined;

  private modelConfig?: TModelConfig;
  private createOpenAIClientFn?: CreateOpenAIClientFn;

  constructor(
    modelConfig?: TModelConfig,
    createOpenAIClientFn?: CreateOpenAIClientFn,
  ) {
    this.modelConfig = modelConfig;
    this.createOpenAIClientFn = createOpenAIClientFn;
  }

  private initialize() {
    if (this.isInitialized) {
      return;
    }

    let configMap: Record<string, string | undefined>;
    if (this.modelConfig) {
      this.isolatedMode = true;
      configMap = this.normalizeModelConfig(this.modelConfig);
    } else {
      configMap = this.globalConfigManager?.getAllEnvConfig() || {};
    }

    const defaultConfig = decideModelConfigFromIntentConfig(
      'default',
      configMap,
    );
    if (!defaultConfig) {
      throw new Error(
        'default model config is not found, which should not happen',
      );
    }

    const insightConfig = decideModelConfigFromIntentConfig(
      'insight',
      configMap,
    );

    const planningConfig = decideModelConfigFromIntentConfig(
      'planning',
      configMap,
    );

    // Each intent uses its own timeout from parsed config (MIDSCENE_MODEL_TIMEOUT,
    // MIDSCENE_INSIGHT_MODEL_TIMEOUT, MIDSCENE_PLANNING_MODEL_TIMEOUT).
    this.modelConfigMap = {
      default: {
        ...defaultConfig,
        createOpenAIClient: this.createOpenAIClientFn,
      },
      insight: {
        ...(insightConfig || defaultConfig),
        createOpenAIClient: this.createOpenAIClientFn,
      },
      planning: {
        ...(planningConfig || defaultConfig),
        createOpenAIClient: this.createOpenAIClientFn,
      },
    };

    this.isInitialized = true;
  }

  private normalizeModelConfig(
    config: TModelConfig,
  ): Record<string, string | undefined> {
    return Object.entries(config).reduce<Record<string, string | undefined>>(
      (acc, [key, value]) => {
        if (value === undefined || value === null) {
          return acc;
        }
        acc[key] = String(value);
        return acc;
      },
      Object.create(null),
    );
  }

  /**
   * should only be called by GlobalConfigManager
   */
  clearModelConfigMap() {
    if (this.isolatedMode) {
      throw new Error(
        'ModelConfigManager work in isolated mode, so clearModelConfigMap should not be called',
      );
    }
    this.isInitialized = false;
  }

  /**
   * if isolatedMode is true, modelConfigMap was initialized in constructor and can't be changed
   * if isolatedMode is false, modelConfigMap can be changed by process.env so we need to recalculate it when it's undefined
   */
  getModelConfig(intent: TIntent): IModelConfig {
    // check if initialized
    if (!this.isInitialized) {
      this.initialize();
    }
    if (!this.modelConfigMap) {
      throw new Error(
        'modelConfigMap is not initialized, which should not happen',
      );
    }
    return this.modelConfigMap[intent];
  }

  getUploadTestServerUrl(): string | undefined {
    const { openaiExtraConfig } = this.getModelConfig('default');
    const serverUrl = openaiExtraConfig?.REPORT_SERVER_URL as string;
    return serverUrl;
  }

  registerGlobalConfigManager(globalConfigManager: GlobalConfigManager) {
    this.globalConfigManager = globalConfigManager;
  }

  throwErrorIfNonVLModel() {
    const modelConfig = this.getModelConfig('default');

    if (!modelConfig.vlMode) {
      throw new Error(
        'MIDSCENE_MODEL_FAMILY is not set to a visual language model (VL model), the element localization can not be achieved. Check your model configuration. See https://midscenejs.com/model-strategy.html',
      );
    }
  }
}
