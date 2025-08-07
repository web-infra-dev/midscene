import type { IModelConfigForVQA, IModelPreferences } from '@/types';
import {
  ANTHROPIC_API_KEY,
  AZURE_OPENAI_API_VERSION,
  AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_KEY,
  MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_AZURE_OPENAI_SCOPE,
  MIDSCENE_DEBUG_AI_PROFILE,
  MIDSCENE_DEBUG_AI_RESPONSE,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_OPENAI_HTTP_PROXY,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_OPENAI_SOCKS_PROXY,
  MIDSCENE_USE_ANTHROPIC_SDK,
  MIDSCENE_USE_AZURE_OPENAI,
  MIDSCENE_VQA_ANTHROPIC_API_KEY,
  MIDSCENE_VQA_AZURE_OPENAI_API_VERSION,
  MIDSCENE_VQA_AZURE_OPENAI_DEPLOYMENT,
  MIDSCENE_VQA_AZURE_OPENAI_ENDPOINT,
  MIDSCENE_VQA_AZURE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_VQA_AZURE_OPENAI_KEY,
  MIDSCENE_VQA_AZURE_OPENAI_SCOPE,
  MIDSCENE_VQA_MODEL_NAME,
  MIDSCENE_VQA_OPENAI_API_KEY,
  MIDSCENE_VQA_OPENAI_BASE_URL,
  MIDSCENE_VQA_OPENAI_HTTP_PROXY,
  MIDSCENE_VQA_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_VQA_OPENAI_SOCKS_PROXY,
  MIDSCENE_VQA_OPENAI_USE_AZURE,
  MIDSCENE_VQA_USE_ANTHROPIC_SDK,
  MIDSCENE_VQA_USE_AZURE_OPENAI,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_USE_AZURE,
  getAIConfig,
  getAIConfigInBoolean,
  getAIConfigInJson,
} from '@midscene/shared/env';
import { enableDebug, getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';

export function getModelName() {
  // default model
  let modelName = 'gpt-4o';
  const nameInConfig = getAIConfig(MIDSCENE_MODEL_NAME);
  if (nameInConfig) {
    modelName = nameInConfig;
  }
  return modelName;
}

function initDebugConfig() {
  const shouldPrintTiming = getAIConfigInBoolean(MIDSCENE_DEBUG_AI_PROFILE);
  let debugConfig = '';
  if (shouldPrintTiming) {
    console.warn(
      'MIDSCENE_DEBUG_AI_PROFILE is deprecated, use DEBUG=midscene:ai:profile instead',
    );
    debugConfig = 'ai:profile';
  }
  const shouldPrintAIResponse = getAIConfigInBoolean(
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
}

interface IModelConfigForCreateLLMClient {
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
  azureOpenaiApiKey?: string;
  azureOpenaiEndpoint?: string;
  azureOpenaiApiVersion?: string;
  azureOpenaiDeployment?: string;
  azureExtraConfig?: Record<string, unknown>;
  /**
   * Anthropic
   */
  useAnthropicSdk?: boolean;
  anthropicApiKey?: string;
}

const createAssert =
  (
    modelNameKey: string,
    modelName: string,
    provider: 'process.env' | 'modelConfig',
  ) =>
  (value: string | undefined, key: string, modelVendorFlag?: string) => {
    if (modelVendorFlag) {
      assert(
        value,
        `The ${key} must be a non-empty string because of the ${modelNameKey} is declared as ${modelName} and ${modelVendorFlag} has also been specified in ${provider}, but got: ${value}\nPlease check your config.`,
      );
    } else {
      assert(
        value,
        `The ${key} must be a non-empty string because of the ${modelNameKey} is declared as ${modelName} in ${provider}, but got: ${value}\nPlease check your config.`,
      );
    }
  };

const getModelConfigFromProvider = ({
  modelName,
  keys,
  valueAssert,
  getStringConfig,
  getJsonConfig,
}: {
  modelName: string;
  keys: Record<
    Exclude<keyof IModelConfigForCreateLLMClient, 'modelName'>,
    Parameters<typeof getAIConfig>[0]
  >;
  valueAssert: (
    value: string | undefined,
    key: string,
    modelVendorFlag?: string,
  ) => void;
  getStringConfig: (key?: string) => string | undefined;
  getJsonConfig: (key?: string) => Record<string, unknown> | undefined;
}): IModelConfigForCreateLLMClient => {
  const socksProxy = getStringConfig(keys.socksProxy);
  const httpProxy = getStringConfig(keys.httpProxy);

  if (getStringConfig(keys.openaiUseAzureDeprecated)) {
    const openaiBaseURL = getStringConfig(keys.openaiBaseURL);
    const openaiApiKey = getStringConfig(keys.openaiApiKey);
    const openaiExtraConfig = getJsonConfig(keys.openaiExtraConfig);

    valueAssert(
      openaiBaseURL,
      keys.openaiBaseURL,
      keys.openaiUseAzureDeprecated,
    );
    valueAssert(openaiApiKey, keys.openaiApiKey, keys.openaiUseAzureDeprecated);

    return {
      socksProxy,
      httpProxy,
      modelName,
      openaiUseAzureDeprecated: true,
      openaiApiKey,
      openaiBaseURL,
      openaiExtraConfig,
    };
  } else if (getStringConfig(keys.useAzureOpenai)) {
    const azureOpenaiScope = getStringConfig(keys.azureOpenaiScope);

    const azureOpenaiApiKey = getStringConfig(keys.azureOpenaiApiKey);
    const azureOpenaiEndpoint = getStringConfig(keys.azureOpenaiEndpoint);
    const azureOpenaiDeployment = getStringConfig(keys.azureOpenaiDeployment);
    const azureOpenaiApiVersion = getStringConfig(keys.azureOpenaiApiVersion);

    const azureExtraConfig = getJsonConfig(keys.azureExtraConfig);
    const openaiExtraConfig = getJsonConfig(keys.openaiExtraConfig);

    valueAssert(azureOpenaiApiKey, keys.azureOpenaiApiKey, keys.useAzureOpenai);

    return {
      socksProxy,
      httpProxy,
      modelName,
      useAzureOpenai: true,
      azureOpenaiScope,
      azureOpenaiApiKey,
      azureOpenaiEndpoint,
      azureOpenaiDeployment,
      azureOpenaiApiVersion,
      azureExtraConfig,
      openaiExtraConfig,
    };
  } else if (getStringConfig(keys.useAnthropicSdk)) {
    const anthropicApiKey = getStringConfig(keys.anthropicApiKey);
    valueAssert(anthropicApiKey, keys.anthropicApiKey, keys.useAnthropicSdk);

    return {
      socksProxy,
      httpProxy,
      modelName,
      useAnthropicSdk: true,
      anthropicApiKey,
    };
  } else {
    const openaiBaseURL = getStringConfig(keys.openaiBaseURL);
    const openaiApiKey = getStringConfig(keys.openaiApiKey);
    const openaiExtraConfig = getJsonConfig(keys.openaiExtraConfig);

    valueAssert(openaiBaseURL, keys.openaiBaseURL);
    valueAssert(openaiApiKey, keys.openaiApiKey);

    return {
      socksProxy,
      httpProxy,
      modelName,
      openaiBaseURL,
      openaiApiKey,
      openaiExtraConfig,
    };
  }
};

const maskKey = (key: string, maskChar = '*') => {
  if (typeof key !== 'string' || key.length === 0) {
    return key;
  }

  const prefixLen = 3;
  const suffixLen = 3;
  const keepLength = prefixLen + suffixLen;

  if (key.length <= keepLength) {
    return key;
  }

  const prefix = key.substring(0, prefixLen);
  const suffix = key.substring(key.length - suffixLen);
  const maskLength = key.length - keepLength;
  const mask = maskChar.repeat(maskLength);

  return `${prefix}${mask}${suffix}`;
};

const maskConfig = (config: IModelConfigForCreateLLMClient) => {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      ['openaiApiKey', 'azureOpenaiApiKey', 'anthropicApiKey'].includes(key)
        ? maskKey(value)
        : value,
    ]),
  );
};

const vqaModelConfigKeys = {
  /**
   * proxy
   */
  socksProxy: MIDSCENE_VQA_OPENAI_SOCKS_PROXY,
  httpProxy: MIDSCENE_VQA_OPENAI_HTTP_PROXY,
  /**
   * OpenAI
   */
  openaiBaseURL: MIDSCENE_VQA_OPENAI_BASE_URL,
  openaiApiKey: MIDSCENE_VQA_OPENAI_API_KEY,
  openaiExtraConfig: MIDSCENE_VQA_OPENAI_INIT_CONFIG_JSON,
  /**
   * Azure
   */
  openaiUseAzureDeprecated: MIDSCENE_VQA_OPENAI_USE_AZURE,
  useAzureOpenai: MIDSCENE_VQA_USE_AZURE_OPENAI,
  azureOpenaiScope: MIDSCENE_VQA_AZURE_OPENAI_SCOPE,
  azureOpenaiApiKey: MIDSCENE_VQA_AZURE_OPENAI_KEY,
  azureOpenaiEndpoint: MIDSCENE_VQA_AZURE_OPENAI_ENDPOINT,
  azureOpenaiApiVersion: MIDSCENE_VQA_AZURE_OPENAI_API_VERSION,
  azureOpenaiDeployment: MIDSCENE_VQA_AZURE_OPENAI_DEPLOYMENT,
  azureExtraConfig: MIDSCENE_VQA_AZURE_OPENAI_INIT_CONFIG_JSON,
  /**
   * Anthropic
   */
  useAnthropicSdk: MIDSCENE_VQA_USE_ANTHROPIC_SDK,
  anthropicApiKey: MIDSCENE_VQA_ANTHROPIC_API_KEY,
} as const;

/**
 * get and validate model config for model client
 */
export const decideModelConfig = (
  modelPreferences?: IModelPreferences,
): IModelConfigForCreateLLMClient => {
  initDebugConfig();

  const debugLog = getDebug('ai:decideModelConfig');

  debugLog('modelPreferences', modelPreferences);

  const isVQAIntent = modelPreferences?.intent === 'VQA';

  const vqaModelCallback = modelPreferences?.modelConfigByIntent?.VQA;
  const vqaModelName = getAIConfig(MIDSCENE_VQA_MODEL_NAME);

  const vqaModelConfig = vqaModelCallback?.();

  if (isVQAIntent && (vqaModelConfig || vqaModelName)) {
    if (vqaModelConfig) {
      debugLog(
        'current action is a VQA action and detected VQA declared in modelConfig, will only read VQA related model config from modelConfig.VQA',
      );
      const modelName = vqaModelConfig[MIDSCENE_VQA_MODEL_NAME];
      assert(
        modelName,
        'The return value of modelConfig.VQA() does not have a valid MIDSCENE_VQA_MODEL_NAME filed.',
      );
      const config = getModelConfigFromProvider({
        modelName,
        keys: vqaModelConfigKeys,
        valueAssert: createAssert(
          MIDSCENE_VQA_MODEL_NAME,
          modelName,
          'modelConfig',
        ),
        getStringConfig: (key) =>
          key ? vqaModelConfig[key as keyof IModelConfigForVQA] : undefined,
        getJsonConfig: (key) => {
          if (key) {
            const content = vqaModelConfig[key as keyof IModelConfigForVQA];
            if (content) {
              try {
                return JSON.parse(content);
              } catch (e) {
                throw new Error(
                  `Failed to parse json config: ${key}. ${(e as Error).message}`,
                  {
                    cause: e,
                  },
                );
              }
            }
          }
          return undefined;
        },
      });
      debugLog(
        'got model config for VQA usage from modelConfig.VQA:',
        maskConfig(config),
      );

      return config;
    } else {
      debugLog(
        `current action is a VQA action and detected ${MIDSCENE_VQA_MODEL_NAME} ${vqaModelName} in process.env, will only read VQA related model config from process.env`,
      );
      const config = getModelConfigFromProvider({
        modelName: vqaModelName!,
        keys: vqaModelConfigKeys,
        valueAssert: createAssert(
          MIDSCENE_VQA_MODEL_NAME,
          vqaModelName!,
          'process.env',
        ),
        getStringConfig: getAIConfig as (key?: string) => string | undefined,
        getJsonConfig: getAIConfigInJson as (
          key?: string,
        ) => Record<string, unknown> | undefined,
      });

      debugLog(
        'got model config for VQA usage from process.env:',
        maskConfig(config),
      );

      return config;
    }
  } else {
    debugLog('read model config from process.env as normal.');
    const commonModelName = getAIConfig(MIDSCENE_MODEL_NAME);
    assert(
      commonModelName,
      `${MIDSCENE_MODEL_NAME} is empty, please check your config.`,
    );
    const config = getModelConfigFromProvider({
      modelName: commonModelName,
      keys: {
        /**
         * proxy
         */
        socksProxy: MIDSCENE_OPENAI_SOCKS_PROXY,
        httpProxy: MIDSCENE_OPENAI_HTTP_PROXY,
        /**
         * OpenAI
         */
        openaiBaseURL: OPENAI_BASE_URL,
        openaiApiKey: OPENAI_API_KEY,
        openaiExtraConfig: MIDSCENE_OPENAI_INIT_CONFIG_JSON,
        /**
         * Azure
         */
        openaiUseAzureDeprecated: OPENAI_USE_AZURE,
        useAzureOpenai: MIDSCENE_USE_AZURE_OPENAI,
        azureOpenaiScope: MIDSCENE_AZURE_OPENAI_SCOPE,
        azureOpenaiApiKey: AZURE_OPENAI_KEY,
        azureOpenaiEndpoint: AZURE_OPENAI_ENDPOINT,
        azureOpenaiApiVersion: AZURE_OPENAI_API_VERSION,
        azureOpenaiDeployment: AZURE_OPENAI_DEPLOYMENT,
        azureExtraConfig: MIDSCENE_AZURE_OPENAI_INIT_CONFIG_JSON,
        /**
         * Anthropic
         */
        useAnthropicSdk: MIDSCENE_USE_ANTHROPIC_SDK,
        anthropicApiKey: ANTHROPIC_API_KEY,
      },
      valueAssert: createAssert(
        MIDSCENE_MODEL_NAME,
        commonModelName,
        'process.env',
      ),
      getStringConfig: getAIConfig as (key?: string) => string | undefined,
      getJsonConfig: getAIConfigInJson as (
        key?: string,
      ) => Record<string, unknown> | undefined,
    });

    debugLog('got model config for common usage:', maskConfig(config));

    return config;
  }
};
