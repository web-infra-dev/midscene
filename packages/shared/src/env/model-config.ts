import type { TIntent, TVlModeTypes } from './types';

import {
  DEFAULT_MODEL_CONFIG_KEYS,
  DEFAULT_MODEL_CONFIG_KEYS_LEGACY,
  GROUNDING_MODEL_CONFIG_KEYS,
  PLANNING_MODEL_CONFIG_KEYS,
  VQA_MODEL_CONFIG_KEYS,
} from './constants';

import { getDebug } from '../logger';
import { assert } from '../utils';
import { createAssert, maskConfig, parseJson } from './helper';
import { initDebugConfig } from './init-debug';
import {
  type UITarsModelVersion,
  parseVlModeAndUiTarsFromGlobalConfig,
  parseVlModeAndUiTarsFromRaw,
} from './parse';

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
   * - vlModeRaw: exists only in non-legacy logic. value can be 'doubao-vision', 'gemini', 'qwen-vl', 'vlm-ui-tars', 'vlm-ui-tars-doubao', 'vlm-ui-tars-doubao-1.5'
   * - vlMode: based on the results of the vlModoRaw classification，value can be 'doubao-vision', 'gemini', 'qwen-vl', 'vlm-ui-tars'
   */
  vlModeRaw?: string;
  vlMode?: string;
  uiTarsVersion?: UITarsModelVersion;
  modelDescription: string;
  /**
   * for debug
   */
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
}): Omit<
  IModelConfig,
  'modelName' | 'from' | 'vlMode' | 'uiTarsVersion' | 'modelDescription'
> => {
  initDebugConfig();
  const debugLog = getDebug('ai:global:config');

  const socksProxy = provider[keys.socksProxy];
  const httpProxy = provider[keys.httpProxy];
  const vlMode = provider[keys.vlMode];

  debugLog('enter decideOpenaiSdkConfig with keys:', keys);
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

    valueAssert(openaiApiKey, keys.openaiApiKey, keys.openaiUseAzureDeprecated);

    return {
      socksProxy,
      httpProxy,
      vlModeRaw: vlMode,
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
      vlModeRaw: vlMode,
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

    valueAssert(openaiApiKey, keys.openaiApiKey);

    return {
      socksProxy,
      httpProxy,
      vlModeRaw: vlMode,
      openaiBaseURL,
      openaiApiKey,
      openaiExtraConfig,
    };
  }
};

const getModelDescription = (
  vlMode: TVlModeTypes | undefined,
  uiTarsVersion: UITarsModelVersion | undefined,
) => {
  if (vlMode) {
    if (uiTarsVersion) {
      return `UI-TARS=${uiTarsVersion}`;
    } else {
      return `${vlMode} mode`;
    }
  }
  return '';
};

/**
 * get and validate model config for model client
 * priority order:
 * - modelConfigFn result
 * - process.env.MIDSCENE_${intent}_MODEL_NAME
 * - PROCESS.ENV.MIDSCENE_MODEL_NAME
 */
export const decideModelConfig = ({
  intent,
  modelConfigFromFn,
  allConfig,
}: {
  intent: TIntent;
  modelConfigFromFn: Record<string, string | undefined> | undefined;
  allConfig: Record<string, string | undefined>;
}): IModelConfig => {
  initDebugConfig();
  const debugLog = getDebug('ai:globalConfig');

  if (modelConfigFromFn) {
    debugLog('decideModelConfig base on agent.modelConfig()');

    const keysForFn = KEYS_MAP[intent];

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
        assert(
          modelConfigFromFn[DEFAULT_MODEL_CONFIG_KEYS.modelName],
          `The return value of agent.modelConfig do not have a valid value with key ${DEFAULT_MODEL_CONFIG_KEYS.modelName}.`,
        );
        return DEFAULT_MODEL_CONFIG_KEYS;
      }
    })();

    const result = decideOpenaiSdkConfig({
      keys: chosenKeys,
      provider: modelConfigFromFn,
      valueAssert: createAssert(
        chosenKeys.modelName,
        'modelConfig',
        candidateModelNameFromConfig,
      ),
    });

    const { vlMode, uiTarsVersion } = parseVlModeAndUiTarsFromRaw(
      result.vlModeRaw,
    );
    const modelDescription = getModelDescription(vlMode, uiTarsVersion);

    const finalResult: IModelConfig = {
      ...result,
      modelName: modelConfigFromFn[chosenKeys.modelName]!,
      vlMode,
      uiTarsVersion,
      modelDescription,
      from: 'modelConfig',
    };

    debugLog(
      `decideModelConfig result by agent.modelConfig() with intent ${intent}:`,
      maskConfig(finalResult),
    );
    return finalResult;
  }

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
      valueAssert: createAssert(keysForEnv.modelName, 'process.env', modelName),
    });

    const { vlMode, uiTarsVersion } = parseVlModeAndUiTarsFromRaw(
      result.vlModeRaw,
    );
    const modelDescription = getModelDescription(vlMode, uiTarsVersion);

    const finalResult: IModelConfig = {
      ...result,
      modelName,
      vlMode,
      uiTarsVersion,
      modelDescription,
      from: 'env',
    };

    debugLog(
      `decideModelConfig result by process.env with intent ${intent}:`,
      maskConfig(finalResult),
    );
    return finalResult;
  }

  debugLog(`decideModelConfig as legacy logic with intent ${intent}.`);

  const result = decideOpenaiSdkConfig({
    keys: DEFAULT_MODEL_CONFIG_KEYS_LEGACY,
    provider: allConfig,
    valueAssert: createAssert(
      DEFAULT_MODEL_CONFIG_KEYS_LEGACY.modelName,
      'process.env',
    ),
  });

  const { vlMode, uiTarsVersion } =
    parseVlModeAndUiTarsFromGlobalConfig(allConfig);

  const modelDescription = getModelDescription(vlMode, uiTarsVersion);

  const finalResult: IModelConfig = {
    ...result,
    // In the legacy logic, GPT-4o is the default model.
    modelName:
      allConfig[DEFAULT_MODEL_CONFIG_KEYS_LEGACY.modelName] || 'gpt-4o',
    vlMode,
    uiTarsVersion,
    modelDescription,
    from: 'legacy-env',
  };

  debugLog(
    `decideModelConfig result by legacy logic with intent ${intent}:`,
    maskConfig(finalResult),
  );
  return finalResult;
};
