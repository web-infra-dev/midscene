import {
  decideModelConfigFromEnv,
  decideModelConfigFromIntentConfig,
} from './decide-model-config';
import type { GlobalConfigManager } from './global-config-manager';

import type {
  CreateOpenAIClientFn,
  IModelConfig,
  TIntent,
  TModelConfigFn,
  TModelConfigFnInternal,
} from './types';
import { VL_MODE_RAW_VALID_VALUES as VL_MODES } from './types';

const ALL_INTENTS: TIntent[] = ['VQA', 'default', 'grounding', 'planning'];

export type TIntentConfigMap = Record<
  TIntent,
  ReturnType<TModelConfigFnInternal> | undefined
>;

export class ModelConfigManager {
  private modelConfigMap: Record<TIntent, IModelConfig> | undefined = undefined;

  // once modelConfigFn is set, isolatedMode will be true
  // modelConfigMap will only depend on modelConfigFn and not effect by process.env
  private isolatedMode = false;

  private globalConfigManager: GlobalConfigManager | undefined = undefined;

  private createOpenAIClientFn?: CreateOpenAIClientFn;

  constructor(
    modelConfigFn?: TModelConfigFn,
    createOpenAIClientFn?: CreateOpenAIClientFn,
  ) {
    this.createOpenAIClientFn = createOpenAIClientFn;
    if (modelConfigFn) {
      this.isolatedMode = true;
      // Cast to internal type - user function can optionally use intent parameter
      // even though it's not shown in the type definition
      const internalFn = modelConfigFn as unknown as TModelConfigFnInternal;
      const intentConfigMap = this.calcIntentConfigMap(internalFn);
      this.modelConfigMap =
        this.calcModelConfigMapBaseOnIntent(intentConfigMap);
    }
  }

  private calcIntentConfigMap(
    modelConfigFn: TModelConfigFnInternal,
  ): TIntentConfigMap {
    const intentConfigMap: TIntentConfigMap = {
      VQA: undefined,
      default: undefined,
      grounding: undefined,
      planning: undefined,
    };

    for (const i of ALL_INTENTS) {
      const result = modelConfigFn({ intent: i });
      if (!result) {
        throw new Error(
          `The agent has an option named modelConfig is a function, but it return ${result} when call with intent ${i}, which should be a object.`,
        );
      }
      intentConfigMap[i] = result;
    }
    return intentConfigMap;
  }

  private calcModelConfigMapBaseOnIntent(intentConfigMap: TIntentConfigMap) {
    const modelConfigMap: Record<TIntent, IModelConfig | undefined> = {
      VQA: undefined,
      default: undefined,
      grounding: undefined,
      planning: undefined,
    };
    for (const i of ALL_INTENTS) {
      const result = decideModelConfigFromIntentConfig(
        i,
        intentConfigMap[i] as unknown as Record<string, string | undefined>,
      );
      modelConfigMap[i] = {
        ...result,
        createOpenAIClient: this.createOpenAIClientFn,
      };
    }
    return modelConfigMap as Record<TIntent, IModelConfig>;
  }

  private calcModelConfigMapBaseOnEnv(
    allEnvConfig: Record<string, string | undefined>,
  ) {
    const modelConfigMap: Record<TIntent, IModelConfig | undefined> = {
      VQA: undefined,
      default: undefined,
      grounding: undefined,
      planning: undefined,
    };
    for (const i of ALL_INTENTS) {
      const result = decideModelConfigFromEnv(i, allEnvConfig);
      modelConfigMap[i] = {
        ...result,
        createOpenAIClient: this.createOpenAIClientFn,
      };
    }
    return modelConfigMap as Record<TIntent, IModelConfig>;
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
    this.modelConfigMap = undefined;
  }

  /**
   * if isolatedMode is true, modelConfigMap was initialized in constructor and can't be changed
   * if isolatedMode is false, modelConfigMap can be changed by process.env so we need to recalculate it when it's undefined
   */
  getModelConfig(intent: TIntent): IModelConfig {
    let config: IModelConfig;

    if (this.isolatedMode) {
      if (!this.modelConfigMap) {
        throw new Error(
          'modelConfigMap is not initialized in isolated mode, which should not happen',
        );
      }
      config = this.modelConfigMap[intent];
    } else {
      if (!this.modelConfigMap) {
        if (!this.globalConfigManager) {
          throw new Error(
            'globalConfigManager is not registered, which should not happen',
          );
        }
        this.modelConfigMap = this.calcModelConfigMapBaseOnEnv(
          this.globalConfigManager.getAllEnvConfig(),
        );
      }
      config = this.modelConfigMap[intent];
    }

    // Validate Planning must use VL mode
    if (intent === 'planning' && !config.vlMode) {
      throw new Error(
        `Planning requires a vision language model (VL model). DOM-based planning is not supported.

Please configure one of the following VL modes:
  ${VL_MODES.map((mode) => `- ${mode}`).join('\n  ')}

Configuration examples:
  - Environment variable: MIDSCENE_PLANNING_VL_MODE=qwen-vl
  - Or use modelConfig function with planning intent

Learn more: https://midscenejs.com/choose-a-model`,
      );
    }

    return config;
  }

  getUploadTestServerUrl(): string | undefined {
    const { openaiExtraConfig } = this.getModelConfig('default');
    const serverUrl = openaiExtraConfig?.REPORT_SERVER_URL as string;
    return serverUrl;
  }

  registerGlobalConfigManager(globalConfigManager: GlobalConfigManager) {
    this.globalConfigManager = globalConfigManager;
  }

  throwErrorIfNonVLModel(intent: TIntent = 'grounding') {
    const modelConfig = this.getModelConfig(intent);

    if (!modelConfig.vlMode) {
      throw new Error(
        'No visual language model (VL model) detected for the current scenario. Element localization may be inaccurate. Please verify your model configuration. Learn more: https://midscenejs.com/choose-a-model',
      );
    }
  }
}
