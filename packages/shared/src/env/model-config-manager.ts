import type { GlobalConfigManager } from './global-config-manager';
import { decideModelConfigFromIntentConfig } from './parse-model-config';

import type {
  CreateOpenAIClientFn,
  IModelConfig,
  TIntent,
  TModelConfigFn,
} from './types';
import { VL_MODE_RAW_VALID_VALUES as VL_MODES } from './types';

export class ModelConfigManager {
  private modelConfigMap: Record<TIntent, IModelConfig> | undefined = undefined;

  private isInitialized = false;

  // once modelConfigFn is set, isolatedMode will be true
  // modelConfigMap will only depend on modelConfigFn and not effect by process.env
  private isolatedMode = false;

  private globalConfigManager: GlobalConfigManager | undefined = undefined;

  private modelConfigFn?: TModelConfigFn;
  private createOpenAIClientFn?: CreateOpenAIClientFn;

  constructor(
    modelConfigFn?: TModelConfigFn,
    createOpenAIClientFn?: CreateOpenAIClientFn,
  ) {
    this.createOpenAIClientFn = createOpenAIClientFn;
    this.modelConfigFn = modelConfigFn;
  }

  private initialize() {
    if (this.isInitialized) {
      return;
    }

    let configMap: Record<string, string | undefined>;
    if (this.modelConfigFn) {
      this.isolatedMode = true;
      // Cast to internal type - user function can optionally use intent parameter
      // even though it's not shown in the type definition
      configMap = this.modelConfigFn() as unknown as Record<string, string>;
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
