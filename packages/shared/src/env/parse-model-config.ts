import {
  DEFAULT_MODEL_CONFIG_KEYS,
  type DEFAULT_MODEL_CONFIG_KEYS_LEGACY,
  INSIGHT_MODEL_CONFIG_KEYS,
  PLANNING_MODEL_CONFIG_KEYS,
} from './constants';
import {
  type IModelConfig,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_OPENAI_HTTP_PROXY,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_OPENAI_SOCKS_PROXY,
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_GEMINI,
  MIDSCENE_USE_QWEN3_VL,
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
  MODEL_FAMILY_VALUES,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  type TIntent,
  type TModelFamily,
  type TVlModeTypes,
  UITarsModelVersion,
} from './types';

import { getDebug } from '../logger';
import { assert } from '../utils';
import { maskConfig, parseJson } from './helper';
import { initDebugConfig } from './init-debug';

type TModelConfigKeys =
  | typeof INSIGHT_MODEL_CONFIG_KEYS
  | typeof PLANNING_MODEL_CONFIG_KEYS
  | typeof DEFAULT_MODEL_CONFIG_KEYS
  | typeof DEFAULT_MODEL_CONFIG_KEYS_LEGACY;

const KEYS_MAP: Record<TIntent, TModelConfigKeys> = {
  insight: INSIGHT_MODEL_CONFIG_KEYS,
  planning: PLANNING_MODEL_CONFIG_KEYS,
  default: DEFAULT_MODEL_CONFIG_KEYS,
} as const;

/**
 * Convert model family to VL configuration
 * @param modelFamily - The model family value
 * @returns Object containing vlMode and uiTarsVersion
 */
export const modelFamilyToVLConfig = (
  modelFamily?: TModelFamily,
): {
  vlMode?: TVlModeTypes;
  uiTarsVersion?: UITarsModelVersion;
} => {
  if (!modelFamily) {
    return { vlMode: undefined, uiTarsVersion: undefined };
  }

  // UI-TARS variants with version handling
  if (modelFamily === 'vlm-ui-tars') {
    return { vlMode: 'vlm-ui-tars', uiTarsVersion: UITarsModelVersion.V1_0 };
  }

  if (
    modelFamily === 'vlm-ui-tars-doubao' ||
    modelFamily === 'vlm-ui-tars-doubao-1.5'
  ) {
    return {
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    };
  }

  // Check if the modelFamily is valid
  if (!MODEL_FAMILY_VALUES.includes(modelFamily as any)) {
    throw new Error(`Invalid MIDSCENE_MODEL_FAMILY value: ${modelFamily}`);
  }

  // For other model families, they directly map to vlMode
  return { vlMode: modelFamily as TVlModeTypes, uiTarsVersion: undefined };
};

/**
 * Convert legacy environment variables to model family
 * @param provider - Environment variable provider (e.g., process.env)
 * @returns The corresponding model family value, or undefined if no legacy config is found
 */
export const legacyConfigToModelFamily = (
  provider: Record<string, string | undefined>,
): TModelFamily | undefined => {
  // Step 1: Parse legacy environment variables to get vlMode and uiTarsVersion
  const isDoubao = provider[MIDSCENE_USE_DOUBAO_VISION];
  const isQwen = provider[MIDSCENE_USE_QWEN_VL];
  const isQwen3 = provider[MIDSCENE_USE_QWEN3_VL];
  const isUiTars = provider[MIDSCENE_USE_VLM_UI_TARS];
  const isGemini = provider[MIDSCENE_USE_GEMINI];

  const enabledModes = [
    isDoubao && MIDSCENE_USE_DOUBAO_VISION,
    isQwen && MIDSCENE_USE_QWEN_VL,
    isQwen3 && MIDSCENE_USE_QWEN3_VL,
    isUiTars && MIDSCENE_USE_VLM_UI_TARS,
    isGemini && MIDSCENE_USE_GEMINI,
  ].filter(Boolean);

  if (enabledModes.length > 1) {
    throw new Error(
      `Only one vision mode can be enabled at a time. Currently enabled modes: ${enabledModes.join(', ')}. Please disable all but one mode.`,
    );
  }

  // Step 2: Map to model family based on detected mode
  // Simple modes that directly map to model family
  if (isQwen3) return 'qwen3-vl';
  if (isQwen) return 'qwen2.5-vl';
  if (isDoubao) return 'doubao-vision';
  if (isGemini) return 'gemini';

  // UI-TARS with version detection
  if (isUiTars) {
    if (isUiTars === '1') {
      return 'vlm-ui-tars';
    } else if (isUiTars === 'DOUBAO' || isUiTars === 'DOUBAO-1.5') {
      return 'vlm-ui-tars-doubao-1.5';
    } else {
      // Handle other UI-TARS versions
      return 'vlm-ui-tars-doubao';
    }
  }

  return undefined;
};

/**
 * Parse OpenAI SDK config
 */
export const parseOpenaiSdkConfig = ({
  keys,
  provider,
  useLegacyLogic = false,
}: {
  keys: TModelConfigKeys;
  provider: Record<string, string | undefined>;
  useLegacyLogic?: boolean;
}): IModelConfig => {
  initDebugConfig();
  const debugLog = getDebug('ai:config');

  debugLog('enter parseOpenaiSdkConfig with keys:', keys);

  const legacyAPIKey = useLegacyLogic ? provider[OPENAI_API_KEY] : undefined;
  const legacyBaseURL = useLegacyLogic ? provider[OPENAI_BASE_URL] : undefined;
  const legacySocksProxy = useLegacyLogic
    ? provider[MIDSCENE_OPENAI_SOCKS_PROXY]
    : undefined;
  const legacyHttpProxy = useLegacyLogic
    ? provider[MIDSCENE_OPENAI_HTTP_PROXY]
    : undefined;
  const legacyOpenaiExtraConfig = useLegacyLogic
    ? provider[MIDSCENE_OPENAI_INIT_CONFIG_JSON]
    : undefined;
  const legacyModelFamily = useLegacyLogic
    ? legacyConfigToModelFamily(provider)
    : undefined;

  const modelFamilyRaw = provider[keys.modelFamily] || legacyModelFamily;
  const openaiApiKey: string | undefined =
    provider[keys.openaiApiKey] || legacyAPIKey;
  const openaiBaseURL: string | undefined =
    provider[keys.openaiBaseURL] || legacyBaseURL;
  const socksProxy: string | undefined =
    provider[keys.socksProxy] || legacySocksProxy;
  const httpProxy: string | undefined =
    provider[keys.httpProxy] || legacyHttpProxy;
  const modelName: string | undefined = provider[keys.modelName];
  const openaiExtraConfigStr: string | undefined =
    provider[keys.openaiExtraConfig];
  const openaiExtraConfig = parseJson(
    keys.openaiExtraConfig,
    openaiExtraConfigStr || legacyOpenaiExtraConfig,
  );
  const temperature = provider[keys.temperature]
    ? Number(provider[keys.temperature])
    : 0;

  const { vlMode, uiTarsVersion } = modelFamilyToVLConfig(
    modelFamilyRaw as unknown as TModelFamily,
  );

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
  const modelDescription = getModelDescription(vlMode, uiTarsVersion);

  return {
    socksProxy,
    httpProxy,
    vlModeRaw: vlMode,
    openaiBaseURL,
    openaiApiKey,
    openaiExtraConfig,
    vlMode,
    uiTarsModelVersion: uiTarsVersion,
    modelName: modelName!,
    modelDescription,
    intent: '-' as any,
    timeout: provider[keys.timeout]
      ? Number(provider[keys.timeout])
      : undefined,
    temperature,
  };
};

export const decideModelConfigFromIntentConfig = (
  intent: TIntent,
  configMap: Record<string, string | undefined>,
): IModelConfig | undefined => {
  const debugLog = getDebug('ai:config');

  debugLog(
    'will decideModelConfig base on agent.modelConfig()',
    intent,
    maskConfig(configMap),
  );

  const keysForFn = KEYS_MAP[intent];
  const modelName = configMap[keysForFn.modelName];

  if (!modelName) {
    debugLog('no modelName found for intent', intent);
    return undefined;
  }

  const finalResult = parseOpenaiSdkConfig({
    keys: keysForFn,
    provider: configMap,
    useLegacyLogic: intent === 'default',
  });
  finalResult.intent = intent;

  debugLog(
    'decideModelConfig result by agent.modelConfig() with intent',
    intent,
    maskConfig({ ...finalResult }),
  );

  assert(
    finalResult.openaiBaseURL,
    `failed to get base URL of model (intent=${intent}). See https://midscenejs.com/model-strategy`,
  );

  if (!finalResult.modelName) {
    console.warn(
      `modelName is not set for intent ${intent}, this may cause unexpected behavior. See https://midscenejs.com/model-strategy`,
    );
  }

  return finalResult;
};
