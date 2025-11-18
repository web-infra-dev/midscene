import {
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_GEMINI,
  MIDSCENE_USE_QWEN3_VL,
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
  MODEL_FAMILY_VALUES,
  type TModelFamily,
  type TVlModeTypes,
  type TVlModeValues,
  UITarsModelVersion,
  VL_MODE_RAW_VALID_VALUES,
} from './types';

export const parseVlModeAndUiTarsModelVersionFromRawValue = (
  vlModeRaw?: string,
): {
  vlMode?: TVlModeTypes;
  uiTarsVersion?: UITarsModelVersion;
} => {
  if (!vlModeRaw) {
    return { vlMode: undefined, uiTarsVersion: undefined };
  }

  if (!VL_MODE_RAW_VALID_VALUES.includes(vlModeRaw as never)) {
    throw new Error(
      `the value ${vlModeRaw} is not a valid VL_MODE value, must be one of ${VL_MODE_RAW_VALID_VALUES}`,
    );
  }
  const raw = vlModeRaw as TVlModeValues;

  if (raw === 'vlm-ui-tars') {
    return { vlMode: 'vlm-ui-tars', uiTarsVersion: UITarsModelVersion.V1_0 };
  }

  if (raw === 'vlm-ui-tars-doubao' || raw === 'vlm-ui-tars-doubao-1.5') {
    return {
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    };
  }

  return { vlMode: raw as TVlModeTypes, uiTarsVersion: undefined };
};

/**
 * legacy logic of how to detect vlMode from process.env without intent
 */
export const parseVlModeAndUiTarsFromGlobalConfig = (
  provider: Record<string, string | undefined>,
): {
  vlMode?: TVlModeTypes;
  uiTarsVersion?: UITarsModelVersion;
} => {
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

  // Simple modes without version
  if (isQwen3) return { vlMode: 'qwen3-vl', uiTarsVersion: undefined };
  if (isQwen) return { vlMode: 'qwen2.5-vl', uiTarsVersion: undefined };
  if (isDoubao) return { vlMode: 'doubao-vision', uiTarsVersion: undefined };
  if (isGemini) return { vlMode: 'gemini', uiTarsVersion: undefined };

  // UI-TARS with version detection
  if (isUiTars) {
    if (isUiTars === '1') {
      return {
        vlMode: 'vlm-ui-tars',
        uiTarsVersion: UITarsModelVersion.V1_0,
      };
    } else if (isUiTars === 'DOUBAO' || isUiTars === 'DOUBAO-1.5') {
      return {
        vlMode: 'vlm-ui-tars',
        uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
      };
    } else {
      return {
        vlMode: 'vlm-ui-tars',
        uiTarsVersion: `${isUiTars}` as UITarsModelVersion,
      };
    }
  }

  return { vlMode: undefined, uiTarsVersion: undefined };
};

/**
 * Check if old MIDSCENE_USE_* environment variables are being used
 * @param provider - Environment variable provider
 * @returns Array of legacy environment variable names that are set
 */
export const detectLegacyVlModeEnvVars = (
  provider: Record<string, string | undefined>,
): string[] => {
  const legacyVars = [
    MIDSCENE_USE_DOUBAO_VISION,
    MIDSCENE_USE_QWEN_VL,
    MIDSCENE_USE_QWEN3_VL,
    MIDSCENE_USE_VLM_UI_TARS,
    MIDSCENE_USE_GEMINI,
  ];

  return legacyVars.filter((varName) => provider[varName]);
};

/**
 * Type guard to check if a string is a valid TModelFamily
 */
function isValidModelFamily(value: string): value is TModelFamily {
  return (MODEL_FAMILY_VALUES as readonly string[]).includes(value);
}

/**
 * Map legacy vlMode and uiTarsVersion to model family
 * @param vlMode - The VL mode type
 * @param uiTarsVersion - The UI-TARS version (if applicable)
 * @returns The corresponding model family value
 */
function mapLegacyToModelFamily(
  vlMode?: TVlModeTypes,
  uiTarsVersion?: UITarsModelVersion,
): TModelFamily | undefined {
  if (!vlMode) return undefined;

  if (vlMode === 'vlm-ui-tars') {
    // UI-TARS needs special handling for version
    if (uiTarsVersion === UITarsModelVersion.V1_0) {
      return 'vlm-ui-tars';
    } else if (uiTarsVersion === UITarsModelVersion.DOUBAO_1_5_20B) {
      return 'vlm-ui-tars-doubao-1.5';
    } else {
      // Handle other UI-TARS versions (vlm-ui-tars-doubao)
      return 'vlm-ui-tars-doubao';
    }
  }

  // For other modes, model family directly matches vlMode
  return vlMode as TModelFamily;
}

/**
 * Parse model family from environment variables with validation and warnings
 * Supports both new MIDSCENE_MODEL_FAMILY and legacy MIDSCENE_USE_* variables
 *
 * @param provider - Environment variable provider
 * @returns Object with vlMode, uiTarsVersion, and warnings
 */
export const parseModelFamilyFromEnv = (
  provider: Record<string, string | undefined>,
): {
  vlMode?: TVlModeTypes;
  uiTarsVersion?: UITarsModelVersion;
  warnings: string[];
  modelFamily?: TModelFamily;
} => {
  const warnings: string[] = [];
  const modelFamilyRaw = provider[MIDSCENE_MODEL_FAMILY];
  const legacyVars = detectLegacyVlModeEnvVars(provider);

  // Case 1: Both new and legacy variables are set - ERROR
  if (modelFamilyRaw && legacyVars.length > 0) {
    throw new Error(
      `Conflicting configuration detected: Both MIDSCENE_MODEL_FAMILY and legacy environment variables (${legacyVars.join(', ')}) are set. Please use only MIDSCENE_MODEL_FAMILY.`,
    );
  }

  // Case 2: Only new MIDSCENE_MODEL_FAMILY is set
  if (modelFamilyRaw) {
    // Validate model family value
    if (!isValidModelFamily(modelFamilyRaw)) {
      throw new Error(
        `Invalid MIDSCENE_MODEL_FAMILY value: "${modelFamilyRaw}". Must be one of: ${MODEL_FAMILY_VALUES.join(', ')}. See documentation: https://midscenejs.com/model-provider.html`,
      );
    }

    const modelFamily = modelFamilyRaw;
    const parsed = parseVlModeAndUiTarsModelVersionFromRawValue(modelFamily);
    return {
      vlMode: parsed.vlMode,
      uiTarsVersion: parsed.uiTarsVersion,
      modelFamily,
      warnings,
    };
  }

  // Case 3: Only legacy variables are set - WARN
  if (legacyVars.length > 0) {
    const legacyResult = parseVlModeAndUiTarsFromGlobalConfig(provider);

    warnings.push(
      `DEPRECATED: Environment ${legacyVars.length > 1 ? 'variables' : 'variable'} ${legacyVars.join(', ')} ${legacyVars.length > 1 ? 'are' : 'is'} deprecated. Please use MIDSCENE_MODEL_FAMILY instead. See migration guide for details.`,
    );

    const modelFamily = mapLegacyToModelFamily(
      legacyResult.vlMode,
      legacyResult.uiTarsVersion,
    );

    return {
      vlMode: legacyResult.vlMode,
      uiTarsVersion: legacyResult.uiTarsVersion,
      modelFamily,
      warnings,
    };
  }

  // Case 4: No configuration set - ERROR
  throw new Error(
    `MIDSCENE_MODEL_FAMILY is required for planning tasks. Please set it to one of: ${MODEL_FAMILY_VALUES.join(', ')}. See documentation: https://midscenejs.com/model-provider.html`,
  );
};
