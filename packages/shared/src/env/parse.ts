import {
  MIDSCENE_PLANNING_STYLE,
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_GEMINI,
  MIDSCENE_USE_QWEN3_VL,
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
  PLANNING_STYLE_VALUES,
  type TPlanningStyle,
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
    return {
      vlMode: undefined,
      uiTarsVersion: undefined,
    };
  }

  if (!VL_MODE_RAW_VALID_VALUES.includes(vlModeRaw as never)) {
    throw new Error(
      `the value ${vlModeRaw} is not a valid VL_MODE value, must be one of ${VL_MODE_RAW_VALID_VALUES}`,
    );
  }
  const raw = vlModeRaw as TVlModeValues;

  if (raw === 'vlm-ui-tars') {
    return {
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.V1_0,
    };
  } else if (raw === 'vlm-ui-tars-doubao' || raw === 'vlm-ui-tars-doubao-1.5') {
    return {
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    };
  }

  return {
    vlMode: raw as TVlModeTypes,
    uiTarsVersion: undefined,
  };
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

  if (isQwen3) {
    return {
      vlMode: 'qwen3-vl',
      uiTarsVersion: undefined,
    };
  }

  if (isQwen) {
    return {
      vlMode: 'qwen-vl',
      uiTarsVersion: undefined,
    };
  }

  if (isDoubao) {
    return {
      vlMode: 'doubao-vision',
      uiTarsVersion: undefined,
    };
  }

  if (isGemini) {
    return {
      vlMode: 'gemini',
      uiTarsVersion: undefined,
    };
  }

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

  return {
    vlMode: undefined,
    uiTarsVersion: undefined,
  };
};

/**
 * Convert planning style to vlModeRaw and uiTarsVersion
 * @param planningStyle - The planning style to convert
 * @returns Object with vlMode and uiTarsVersion
 *
 * Note: Most planning styles map 1:1 to vlModeRaw, except:
 * - 'default' -> 'qwen3-vl'
 */
export const convertPlanningStyleToVlMode = (
  planningStyle: TPlanningStyle,
): {
  vlModeRaw: TVlModeValues;
  vlMode: TVlModeTypes;
  uiTarsVersion?: UITarsModelVersion;
} => {
  // Handle 'default' -> 'qwen3-vl'
  if (planningStyle === 'default') {
    return {
      vlModeRaw: 'qwen3-vl',
      vlMode: 'qwen3-vl',
      uiTarsVersion: undefined,
    };
  }

  // For all other values, planning style directly maps to vlModeRaw
  const vlModeRaw = planningStyle as TVlModeValues;

  // Parse to get vlMode and uiTarsVersion
  const parsed = parseVlModeAndUiTarsModelVersionFromRawValue(vlModeRaw);
  return {
    vlModeRaw,
    vlMode: parsed.vlMode!, // Non-null assertion: vlModeRaw is always a valid value
    uiTarsVersion: parsed.uiTarsVersion,
  };
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
 * Parse planning style from environment variables with validation and warnings
 * Supports both new MIDSCENE_PLANNING_STYLE and legacy MIDSCENE_USE_* variables
 *
 * @param provider - Environment variable provider
 * @returns Object with vlMode, uiTarsVersion, and warnings
 */
export const parsePlanningStyleFromEnv = (
  provider: Record<string, string | undefined>,
): {
  vlMode?: TVlModeTypes;
  vlModeRaw?: TVlModeValues;
  uiTarsVersion?: UITarsModelVersion;
  warnings: string[];
  planningStyle?: TPlanningStyle;
} => {
  const warnings: string[] = [];
  const planningStyleRaw = provider[MIDSCENE_PLANNING_STYLE];
  const legacyVars = detectLegacyVlModeEnvVars(provider);

  // Case 1: Both new and legacy variables are set - ERROR
  if (planningStyleRaw && legacyVars.length > 0) {
    throw new Error(
      `Conflicting configuration detected: Both MIDSCENE_PLANNING_STYLE and legacy environment variables (${legacyVars.join(', ')}) are set. Please use only MIDSCENE_PLANNING_STYLE.`,
    );
  }

  // Case 2: Only new MIDSCENE_PLANNING_STYLE is set
  if (planningStyleRaw) {
    const planningStyle = planningStyleRaw as TPlanningStyle;

    // Validate planning style value
    if (!PLANNING_STYLE_VALUES.includes(planningStyle)) {
      throw new Error(
        `Invalid MIDSCENE_PLANNING_STYLE value: "${planningStyleRaw}". Must be one of: ${PLANNING_STYLE_VALUES.join(', ')}. See documentation: https://midscenejs.com/model-provider.html`,
      );
    }

    const result = convertPlanningStyleToVlMode(planningStyle);
    return {
      ...result,
      planningStyle,
      warnings,
    };
  }

  // Case 3: Only legacy variables are set - WARN
  if (legacyVars.length > 0) {
    const legacyResult = parseVlModeAndUiTarsFromGlobalConfig(provider);

    warnings.push(
      `DEPRECATED: Environment variable ${legacyVars.join(', ')} is deprecated. Please use MIDSCENE_PLANNING_STYLE instead. See migration guide for details.`,
    );

    // Map legacy vlMode to planning style for display
    // Since planning style now directly uses vlModeRaw values,
    // we need to construct the vlModeRaw from vlMode + uiTarsVersion
    let planningStyle: TPlanningStyle | undefined;
    let vlModeRaw: TVlModeValues | undefined;

    if (legacyResult.vlMode === 'vlm-ui-tars') {
      // UI-TARS needs special handling for version
      if (legacyResult.uiTarsVersion === UITarsModelVersion.V1_0) {
        planningStyle = 'vlm-ui-tars';
        vlModeRaw = 'vlm-ui-tars';
      } else if (
        legacyResult.uiTarsVersion === UITarsModelVersion.DOUBAO_1_5_20B
      ) {
        planningStyle = 'vlm-ui-tars-doubao-1.5';
        vlModeRaw = 'vlm-ui-tars-doubao-1.5';
      } else {
        // Handle other UI-TARS versions (vlm-ui-tars-doubao)
        planningStyle = 'vlm-ui-tars-doubao';
        vlModeRaw = 'vlm-ui-tars-doubao';
      }
    } else if (legacyResult.vlMode) {
      // For other modes, planning style directly matches vlMode
      planningStyle = legacyResult.vlMode as TPlanningStyle;
      vlModeRaw = legacyResult.vlMode as TVlModeValues;
    }

    return {
      vlMode: legacyResult.vlMode,
      vlModeRaw,
      uiTarsVersion: legacyResult.uiTarsVersion,
      planningStyle,
      warnings,
    };
  }

  // Case 4: No configuration set - ERROR
  throw new Error(
    `MIDSCENE_PLANNING_STYLE is required for planning tasks. Please set it to one of: ${PLANNING_STYLE_VALUES.join(', ')}. See documentation: https://midscenejs.com/model-provider.html`,
  );
};
