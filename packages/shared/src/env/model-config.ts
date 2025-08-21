import { globalConfigManger } from './global-config';
import {
  type IModelPreferences,
  MIDSCENE_DEBUG_AI_PROFILE,
  MIDSCENE_DEBUG_AI_RESPONSE,
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_GEMINI,
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
  type TIntent,
} from './types';

import {
  DEFAULT_MODEL_CONFIG_KEYS,
  DEFAULT_MODEL_CONFIG_KEYS_LEGACY,
  GROUNDING_MODEL_CONFIG_KEYS,
  PLANNING_MODEL_CONFIG_KEYS,
  VQA_MODEL_CONFIG_KEYS,
} from './constants';

import { enableDebug, getDebug } from '../logger';
import { assert } from '../utils';

const initDebugConfig = () => {
  const shouldPrintTiming = globalConfigManger.getConfigValueInBoolean(
    MIDSCENE_DEBUG_AI_PROFILE,
  );
  let debugConfig = '';
  if (shouldPrintTiming) {
    console.warn(
      'MIDSCENE_DEBUG_AI_PROFILE is deprecated, use DEBUG=midscene:ai:profile instead',
    );
    debugConfig = 'ai:profile';
  }
  const shouldPrintAIResponse = globalConfigManger.getConfigValueInBoolean(
    MIDSCENE_DEBUG_AI_RESPONSE,
  );

  if (shouldPrintAIResponse) {
    console.warn(
      'MIDSCENE_DEBUG_AI_RESPONSE is deprecated, use DEBUG=midscene:ai:response instead',
    );
    if (debugConfig) {
      debugConfig = 'ai:*';
    } else {
      debugConfig = 'ai:call';
    }
  }
  if (debugConfig) {
    enableDebug(debugConfig);
  }
};

export const createAssert =
  (
    modelNameKey: string,
    provider: 'process.env' | 'modelConfig',
    modelName?: string,
  ) =>
  (value: string | undefined, key: string, modelVendorFlag?: string) => {
    if (modelName) {
      if (modelVendorFlag) {
        assert(
          value,
          `The ${key} must be a non-empty string because of the ${modelNameKey} is declared as ${modelName} and ${modelVendorFlag} has also been specified in ${provider}, but got: ${value}. Please check your config.`,
        );
      } else {
        assert(
          value,
          `The ${key} must be a non-empty string because of the ${modelNameKey} is declared as ${modelName} in ${provider}, but got: ${value}. Please check your config.`,
        );
      }
    } else {
      assert(
        value,
        `The ${key} must be a non-empty string, but got: ${value}. Please check your config.`,
      );
    }
  };

export const parseJson = (key: string, value: string | undefined) => {
  if (value !== undefined) {
    try {
      return JSON.parse(value);
    } catch (e) {
      throw new Error(
        `Failed to parse ${key} as a JSON. ${(e as Error).message}`,
        {
          cause: e,
        },
      );
    }
  }
  return undefined;
};

export interface IModelConfig {
  /**
   * proxy
   */
  socksProxy?: string;
  httpProxy?: string;
  /**
   * model
   */
  modelName: string;
  /**
   * OpenAI
   */
  openaiBaseURL?: string;
  openaiApiKey?: string;
  openaiExtraConfig?: Record<string, unknown>;
  /**
   * Azure
   */
  openaiUseAzureDeprecated?: boolean;
  useAzureOpenai?: boolean;
  azureOpenaiScope?: string;
  azureOpenaiKey?: string;
  azureOpenaiEndpoint?: string;
  azureOpenaiApiVersion?: string;
  azureOpenaiDeployment?: string;
  azureExtraConfig?: Record<string, unknown>;
  /**
   * Anthropic
   */
  useAnthropicSdk?: boolean;
  anthropicApiKey?: string;
  /**
   * vlm
   */
  vlMode?: string;
  from: 'modelConfig' | 'env' | 'legacy-env';
}

type TModelConfigKeys =
  | typeof VQA_MODEL_CONFIG_KEYS
  | typeof GROUNDING_MODEL_CONFIG_KEYS
  | typeof PLANNING_MODEL_CONFIG_KEYS
  | typeof DEFAULT_MODEL_CONFIG_KEYS
  | typeof DEFAULT_MODEL_CONFIG_KEYS_LEGACY;

const KEYS_MAP: Record<TIntent, TModelConfigKeys> = {
  VQA: VQA_MODEL_CONFIG_KEYS,
  grounding: GROUNDING_MODEL_CONFIG_KEYS,
  planning: PLANNING_MODEL_CONFIG_KEYS,
  default: DEFAULT_MODEL_CONFIG_KEYS,
} as const;

/**
 * Choose OpenAI SDK config, such as OpenAI, AzureOpenAI, AnthropicSDK, etc.
 */
export const decideOpenaiSdkConfig = ({
  keys,
  provider,
  valueAssert,
}: {
  keys: TModelConfigKeys;
  provider: Record<string, string | undefined>;
  valueAssert: (
    value: string | undefined,
    key: string,
    modelVendorFlag?: string,
  ) => void;
}): Omit<IModelConfig, 'modelName' | 'from'> => {
  const socksProxy = provider[keys.socksProxy];
  const httpProxy = provider[keys.httpProxy];
  const vlMode = provider[keys.vlMode];
  const debugLog = getDebug('ai:decideModel');

  debugLog('enter decideOpenaiSdkConfig', provider, keys);
  if (provider[keys.openaiUseAzureDeprecated]) {
    debugLog(
      `provider has ${keys.openaiUseAzureDeprecated} with value${provider[keys.openaiUseAzureDeprecated]}`,
    );
    const openaiBaseURL = provider[keys.openaiBaseURL];
    const openaiApiKey = provider[keys.openaiApiKey];
    const openaiExtraConfig = parseJson(
      keys.openaiExtraConfig,
      provider[keys.openaiExtraConfig],
    );

    valueAssert(
      openaiBaseURL,
      keys.openaiBaseURL,
      keys.openaiUseAzureDeprecated,
    );
    valueAssert(openaiApiKey, keys.openaiApiKey, keys.openaiUseAzureDeprecated);

    return {
      socksProxy,
      httpProxy,
      vlMode,
      openaiUseAzureDeprecated: true,
      openaiApiKey,
      openaiBaseURL,
      openaiExtraConfig,
    };
  } else if (provider[keys.useAzureOpenai]) {
    debugLog(
      `provider has ${keys.useAzureOpenai} with value ${provider[keys.useAzureOpenai]}`,
    );
    const azureOpenaiScope = provider[keys.azureOpenaiScope];

    const azureOpenaiKey = provider[keys.azureOpenaiKey];
    const azureOpenaiEndpoint = provider[keys.azureOpenaiEndpoint];
    const azureOpenaiDeployment = provider[keys.azureOpenaiDeployment];
    const azureOpenaiApiVersion = provider[keys.azureOpenaiApiVersion];

    const azureExtraConfig = parseJson(
      keys.azureExtraConfig,
      provider[keys.azureExtraConfig],
    );
    const openaiExtraConfig = parseJson(
      keys.openaiExtraConfig,
      provider[keys.openaiExtraConfig],
    );

    valueAssert(azureOpenaiKey, keys.azureOpenaiKey, keys.useAzureOpenai);

    return {
      socksProxy,
      httpProxy,
      vlMode,
      useAzureOpenai: true,
      azureOpenaiScope,
      azureOpenaiKey,
      azureOpenaiEndpoint,
      azureOpenaiDeployment,
      azureOpenaiApiVersion,
      azureExtraConfig,
      openaiExtraConfig,
    };
  } else if (provider[keys.useAnthropicSdk]) {
    debugLog(
      `provider has ${keys.useAnthropicSdk} with value ${provider[keys.useAnthropicSdk]}`,
    );
    const anthropicApiKey = provider[keys.anthropicApiKey];
    valueAssert(anthropicApiKey, keys.anthropicApiKey, keys.useAnthropicSdk);

    return {
      socksProxy,
      httpProxy,
      useAnthropicSdk: true,
      anthropicApiKey,
    };
  } else {
    debugLog('provider has no specific model SDK declared');
    const openaiBaseURL = provider[keys.openaiBaseURL];
    const openaiApiKey = provider[keys.openaiApiKey];
    const openaiExtraConfig = parseJson(
      keys.openaiExtraConfig,
      provider[keys.openaiExtraConfig],
    );

    valueAssert(openaiBaseURL, keys.openaiBaseURL);
    valueAssert(openaiApiKey, keys.openaiApiKey);

    return {
      socksProxy,
      httpProxy,
      vlMode,
      openaiBaseURL,
      openaiApiKey,
      openaiExtraConfig,
    };
  }
};

/**
 * legacy logic of how to detect vlMode from process.env without intent
 */
const decideVlModelValueFromGlobalConfig = ():
  | 'qwen-vl'
  | 'doubao-vision'
  | 'gemini'
  | 'vlm-ui-tars'
  | undefined => {
  const debugLog = getDebug('ai:decideModel');

  const isDoubao = globalConfigManger.getConfigValueInBoolean(
    MIDSCENE_USE_DOUBAO_VISION,
  );
  const isQwen =
    globalConfigManger.getConfigValueInBoolean(MIDSCENE_USE_QWEN_VL);

  const isUiTars = globalConfigManger.getConfigValueInBoolean(
    MIDSCENE_USE_VLM_UI_TARS,
  );

  const isGemini =
    globalConfigManger.getConfigValueInBoolean(MIDSCENE_USE_GEMINI);

  debugLog('decideVlModelValueFromGlobalConfig get enabledModes', {
    isDoubao,
    isQwen,
    isUiTars,
    isGemini,
  });

  const enabledModes = [
    isDoubao && MIDSCENE_USE_DOUBAO_VISION,
    isQwen && MIDSCENE_USE_QWEN_VL,
    isUiTars && MIDSCENE_USE_VLM_UI_TARS,
    isGemini && MIDSCENE_USE_GEMINI,
  ].filter(Boolean);

  if (enabledModes.length > 1) {
    throw new Error(
      `Only one vision mode can be enabled at a time. Currently enabled modes: ${enabledModes.join(', ')}. Please disable all but one mode.`,
    );
  }

  if (isQwen) {
    return 'qwen-vl';
  }

  if (isDoubao) {
    return 'doubao-vision';
  }

  if (isGemini) {
    return 'gemini';
  }

  if (isUiTars) {
    return 'vlm-ui-tars';
  }

  return undefined;
};

/**
 * get and validate model config for model client
 * priority order:
 * - modelConfigFn result
 * - process.env.MIDSCENE_${intent}_MODEL_NAME
 * - PROCESS.ENV.MIDSCENE_MODEL_NAME
 */
export const decideModelConfig = (
  modelPreferences: IModelPreferences,
  withAssert: boolean,
): IModelConfig => {
  initDebugConfig();
  const debugLog = getDebug('ai:decideModel');

  debugLog('modelPreferences', modelPreferences);

  const { intent } = modelPreferences;

  const { hasModelConfigFn, result: modelConfigFromFn } =
    globalConfigManger.getModelConfig(intent);

  debugLog('The return value of agent.modelConfig()', modelConfigFromFn);

  if (hasModelConfigFn) {
    if (!modelConfigFromFn) {
      throw new Error(
        `The agent has an option named modelConfig is a function, but it return ${modelConfigFromFn} when call with intent ${intent}, which should be a object.`,
      );
    }

    const keysForFn = KEYS_MAP[intent];

    debugLog('ChooseOpenaiSdkConfig base on agent.modelConfig()');
    const candidateModelNameFromConfig = modelConfigFromFn[keysForFn.modelName];

    debugLog('Got modelName from modelConfigFn', candidateModelNameFromConfig);

    const chosenKeys = (() => {
      if (candidateModelNameFromConfig) {
        debugLog(
          'query modelConfig from fn by intent got corresponding modelName, will get other corresponding keys',
        );
        return keysForFn;
      } else {
        debugLog(
          'query modelConfig from fn by intent got no corresponding modelName, will get other keys by default',
        );
        if (withAssert) {
          assert(
            modelConfigFromFn[DEFAULT_MODEL_CONFIG_KEYS.modelName],
            `The return value of agent.modelConfig do not have a valid value with key ${DEFAULT_MODEL_CONFIG_KEYS.modelName}.`,
          );
        }
        return DEFAULT_MODEL_CONFIG_KEYS;
      }
    })();

    const result = decideOpenaiSdkConfig({
      keys: chosenKeys,
      provider: modelConfigFromFn,
      valueAssert: withAssert
        ? createAssert(
            chosenKeys.modelName,
            'modelConfig',
            candidateModelNameFromConfig,
          )
        : () => {},
    });

    const finalResult: IModelConfig = {
      ...result,
      modelName: modelConfigFromFn[chosenKeys.modelName],
      from: 'modelConfig',
    };

    debugLog('ChooseOpenaiSdkConfig result:', finalResult);
    return finalResult;
  }

  const allConfig = globalConfigManger.getAllConfig();

  const keysForEnv =
    intent === 'default' ? DEFAULT_MODEL_CONFIG_KEYS_LEGACY : KEYS_MAP[intent];

  const candidateModelNameFromEnv = allConfig[keysForEnv.modelName];

  debugLog(
    `Get value of ${keysForEnv.modelName} from globalConfig`,
    candidateModelNameFromEnv,
  );

  if (intent !== 'default' && allConfig[keysForEnv.modelName]) {
    const modelName = allConfig[keysForEnv.modelName]!;

    debugLog(
      `Got intent ${intent} corresponding modelName ${modelName} by key ${keysForEnv.modelName} from globalConfig, will get other config by intent.`,
    );

    const result = decideOpenaiSdkConfig({
      keys: keysForEnv,
      provider: allConfig,
      valueAssert: withAssert
        ? createAssert(keysForEnv.modelName, 'process.env', modelName)
        : () => {},
    });

    const finalResult: IModelConfig = {
      ...result,
      modelName,
      from: 'env',
    };

    debugLog('ChooseOpenaiSdkConfig result:', finalResult);
  }

  debugLog(`ChooseOpenaiSdkConfig as legacy logic with intent ${intent}.`);
  const result = decideOpenaiSdkConfig({
    keys: DEFAULT_MODEL_CONFIG_KEYS_LEGACY,
    provider: allConfig,
    valueAssert: withAssert
      ? createAssert(DEFAULT_MODEL_CONFIG_KEYS_LEGACY.modelName, 'process.env')
      : () => {},
  });

  const vlMode = decideVlModelValueFromGlobalConfig();

  const finalResult: IModelConfig = {
    ...result,
    // In the legacy logic, GPT-4o is the default model.
    modelName:
      allConfig[DEFAULT_MODEL_CONFIG_KEYS_LEGACY.modelName] || 'gpt-4o',
    vlMode,
    from: 'legacy-env',
  };

  debugLog('ChooseOpenaiSdkConfig result:', finalResult);
  return finalResult;
};
