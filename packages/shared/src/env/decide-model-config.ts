import type {
  IModelConfig,
  TIntent,
  TVlModeTypes,
  UITarsModelVersion,
} from './types';

import {
  DEFAULT_MODEL_CONFIG_KEYS,
  DEFAULT_MODEL_CONFIG_KEYS_LEGACY,
  INSIGHT_MODEL_CONFIG_KEYS,
  PLANNING_MODEL_CONFIG_KEYS,
} from './constants';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_HTTP_PROXY,
  MIDSCENE_MODEL_INIT_CONFIG_JSON,
  MIDSCENE_MODEL_SOCKS_PROXY,
  MIDSCENE_OPENAI_HTTP_PROXY,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_OPENAI_SOCKS_PROXY,
  MODEL_API_KEY,
  MODEL_BASE_URL,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from './types';

import { getDebug } from '../logger';
import { assert } from '../utils';
import { createAssert, maskConfig, parseJson } from './helper';
import { initDebugConfig } from './init-debug';
import {
  parsePlanningStyleFromEnv,
  parseVlModeAndUiTarsFromGlobalConfig,
  parseVlModeAndUiTarsModelVersionFromRawValue,
} from './parse';

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
 * Choose OpenAI SDK config
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
  | 'modelName'
  | 'from'
  | 'vlMode'
  | 'uiTarsVersion'
  | 'modelDescription'
  | 'intent'
> => {
  initDebugConfig();
  const debugLog = getDebug('ai:config');

  const vlMode = provider[keys.vlMode];

  debugLog('enter decideOpenaiSdkConfig with keys:', keys);

  // Implement compatibility logic: prefer new variable names (MIDSCENE_MODEL_*), fallback to old ones (MIDSCENE_OPENAI_*)
  let openaiBaseURL: string | undefined;
  let openaiApiKey: string | undefined;
  let socksProxy: string | undefined;
  let httpProxy: string | undefined;
  let openaiExtraConfigStr: string | undefined;

  // Prefer the new public variables when using the default intent config.
  if (
    keys.openaiBaseURL === MIDSCENE_MODEL_BASE_URL ||
    keys.openaiBaseURL === OPENAI_BASE_URL
  ) {
    openaiBaseURL =
      provider[MIDSCENE_MODEL_BASE_URL] ||
      provider[MODEL_BASE_URL] ||
      provider[keys.openaiBaseURL];
  } else {
    openaiBaseURL = provider[keys.openaiBaseURL];
  }

  if (
    keys.openaiApiKey === MIDSCENE_MODEL_API_KEY ||
    keys.openaiApiKey === OPENAI_API_KEY
  ) {
    openaiApiKey =
      provider[MIDSCENE_MODEL_API_KEY] ||
      provider[MODEL_API_KEY] ||
      provider[keys.openaiApiKey];
  } else {
    openaiApiKey = provider[keys.openaiApiKey];
  }

  // Proxy compatibility: prefer MIDSCENE_MODEL_* over MIDSCENE_OPENAI_*
  if (keys.socksProxy === MIDSCENE_OPENAI_SOCKS_PROXY) {
    // Priority: MIDSCENE_MODEL_SOCKS_PROXY > MIDSCENE_OPENAI_SOCKS_PROXY
    socksProxy =
      provider[MIDSCENE_MODEL_SOCKS_PROXY] || provider[keys.socksProxy];
  } else {
    socksProxy = provider[keys.socksProxy];
  }

  if (keys.httpProxy === MIDSCENE_OPENAI_HTTP_PROXY) {
    // Priority: MIDSCENE_MODEL_HTTP_PROXY > MIDSCENE_OPENAI_HTTP_PROXY
    httpProxy = provider[MIDSCENE_MODEL_HTTP_PROXY] || provider[keys.httpProxy];
  } else {
    httpProxy = provider[keys.httpProxy];
  }

  // Init config compatibility: prefer MIDSCENE_MODEL_INIT_CONFIG_JSON over MIDSCENE_OPENAI_INIT_CONFIG_JSON
  if (keys.openaiExtraConfig === MIDSCENE_OPENAI_INIT_CONFIG_JSON) {
    // Priority: MIDSCENE_MODEL_INIT_CONFIG_JSON > MIDSCENE_OPENAI_INIT_CONFIG_JSON
    openaiExtraConfigStr =
      provider[MIDSCENE_MODEL_INIT_CONFIG_JSON] ||
      provider[keys.openaiExtraConfig];
  } else {
    openaiExtraConfigStr = provider[keys.openaiExtraConfig];
  }

  const openaiExtraConfig = parseJson(
    keys.openaiExtraConfig,
    openaiExtraConfigStr,
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

export const decideModelConfigFromIntentConfig = (
  intent: TIntent,
  intentConfig: Record<string, string | undefined>,
): IModelConfig => {
  const debugLog = getDebug('ai:config');

  debugLog('decideModelConfig base on agent.modelConfig()');

  const keysForFn = KEYS_MAP[intent];

  const candidateModelNameFromConfig = intentConfig[keysForFn.modelName];

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
        intentConfig[DEFAULT_MODEL_CONFIG_KEYS.modelName],
        `The return value of agent.modelConfig do not have a valid value with key ${DEFAULT_MODEL_CONFIG_KEYS.modelName}.`,
      );
      return DEFAULT_MODEL_CONFIG_KEYS;
    }
  })();

  const result = decideOpenaiSdkConfig({
    keys: chosenKeys,
    provider: intentConfig,
    valueAssert: createAssert(
      chosenKeys.modelName,
      'modelConfig',
      candidateModelNameFromConfig,
    ),
  });

  const { vlMode, uiTarsVersion } =
    parseVlModeAndUiTarsModelVersionFromRawValue(result.vlModeRaw);

  const modelDescription = getModelDescription(vlMode, uiTarsVersion);

  const finalResult: IModelConfig = {
    ...result,
    modelName: intentConfig[chosenKeys.modelName]!,
    vlMode,
    uiTarsModelVersion: uiTarsVersion,
    modelDescription,
    from: 'modelConfig',
    intent,
  };

  debugLog(
    `decideModelConfig result by agent.modelConfig() with intent ${intent}:`,
    maskConfig(finalResult),
  );
  return finalResult;
};

export const decideModelConfigFromEnv = (
  intent: TIntent,
  allEnvConfig: Record<string, string | undefined>,
): IModelConfig => {
  initDebugConfig();
  const debugLog = getDebug('ai:config');

  const keysForEnv =
    intent === 'default' ? DEFAULT_MODEL_CONFIG_KEYS_LEGACY : KEYS_MAP[intent];

  if (intent !== 'default' && allEnvConfig[keysForEnv.modelName]) {
    const modelName = allEnvConfig[keysForEnv.modelName]!;

    debugLog(
      `Got intent ${intent} corresponding modelName ${modelName} by key ${keysForEnv.modelName} from globalConfig, will get other config by intent.`,
    );

    const result = decideOpenaiSdkConfig({
      keys: keysForEnv,
      provider: allEnvConfig,
      valueAssert: createAssert(keysForEnv.modelName, 'process.env', modelName),
    });

    let vlMode: TVlModeTypes | undefined;
    let uiTarsVersion: UITarsModelVersion | undefined;

    // For planning intent, use the new MIDSCENE_PLANNING_STYLE approach
    if (intent === 'planning') {
      const parseResult = parsePlanningStyleFromEnv(allEnvConfig);
      vlMode = parseResult.vlMode;
      uiTarsVersion = parseResult.uiTarsVersion;

      // Output warnings to debug log
      parseResult.warnings.forEach((warning) => {
        console.warn(`[Midscene] ${warning}`);
      });

      if (parseResult.planningStyle) {
        // NOTE: If this block is refactored into a helper function, ensure `debugLog` is passed as a parameter.
        debugLog(`Using planning style: ${parseResult.planningStyle}`);
      }
    } else {
      // For other intents, use the old parsing logic
      const parsed = parseVlModeAndUiTarsModelVersionFromRawValue(
        result.vlModeRaw,
      );
      vlMode = parsed.vlMode;
      uiTarsVersion = parsed.uiTarsVersion;
    }

    const modelDescription = getModelDescription(vlMode, uiTarsVersion);

    const finalResult: IModelConfig = {
      ...result,
      modelName,
      vlMode,
      uiTarsModelVersion: uiTarsVersion,
      modelDescription,
      from: 'env',
      intent,
    };

    debugLog(
      `decideModelConfig result by process.env with intent ${intent}:`,
      maskConfig(finalResult),
    );
    return finalResult;
  }

  debugLog(`decideModelConfig as legacy logic with intent ${intent}.`);

  // TODO: when fallback to legacy logic, prefer to read MIDSCENE_OPENAI_API_KEY rather than OPENAI_API_KEY
  const result = decideOpenaiSdkConfig({
    keys: DEFAULT_MODEL_CONFIG_KEYS_LEGACY,
    provider: allEnvConfig,
    valueAssert: createAssert(
      DEFAULT_MODEL_CONFIG_KEYS_LEGACY.modelName,
      'process.env',
    ),
  });

  let vlMode: TVlModeTypes | undefined;
  let uiTarsVersion: UITarsModelVersion | undefined;

  // For planning intent in legacy logic, still use the new MIDSCENE_PLANNING_STYLE approach
  if (intent === 'planning') {
    const parseResult = parsePlanningStyleFromEnv(allEnvConfig);
    vlMode = parseResult.vlMode;
    uiTarsVersion = parseResult.uiTarsVersion;

    // Output warnings to debug log
    parseResult.warnings.forEach((warning) => {
      console.warn(`[Midscene] ${warning}`);
    });

    if (parseResult.planningStyle) {
      debugLog(`Using planning style: ${parseResult.planningStyle}`);
    }
  } else {
    // For other intents, use the old parsing logic
    const parsed = parseVlModeAndUiTarsFromGlobalConfig(allEnvConfig);
    vlMode = parsed.vlMode;
    uiTarsVersion = parsed.uiTarsVersion;
  }

  const modelDescription = getModelDescription(vlMode, uiTarsVersion);

  const finalResult: IModelConfig = {
    ...result,
    // In the legacy logic, GPT-4o is the default model.
    modelName:
      allEnvConfig[DEFAULT_MODEL_CONFIG_KEYS_LEGACY.modelName] || 'gpt-4o',
    vlMode,
    uiTarsModelVersion: uiTarsVersion,
    modelDescription,
    from: 'legacy-env',
    intent,
  };

  debugLog(
    `decideModelConfig result by legacy logic with intent ${intent}:`,
    maskConfig(finalResult),
  );
  return finalResult;
};
