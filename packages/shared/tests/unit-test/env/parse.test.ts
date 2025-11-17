import { describe, expect, it } from 'vitest';
import { UITarsModelVersion } from '../../../src/env/';
import {
  convertPlanningStyleToVlMode,
  inferPlanningStyleFromModelName,
  parsePlanningStyleFromEnv,
  parseVlModeAndUiTarsFromGlobalConfig,
  parseVlModeAndUiTarsModelVersionFromRawValue,
} from '../../../src/env/parse';
import {
  MIDSCENE_PLANNING_STYLE,
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_GEMINI,
  MIDSCENE_USE_QWEN3_VL,
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
} from '../../../src/env/types';

describe('parseVlModeAndUiTarsFromRaw', () => {
  it('should return undefined for both vlMode and uiTarsVersion when raw value is empty', () => {
    expect(parseVlModeAndUiTarsModelVersionFromRawValue(undefined)).toEqual({
      vlMode: undefined,
      uiTarsVersion: undefined,
    });
  });

  it('should throw an error for invalid raw value', () => {
    expect(() =>
      parseVlModeAndUiTarsModelVersionFromRawValue('invalid-mode'),
    ).toThrow();
  });

  it('should correctly parse "vlm-ui-tars"', () => {
    expect(parseVlModeAndUiTarsModelVersionFromRawValue('vlm-ui-tars')).toEqual(
      {
        vlMode: 'vlm-ui-tars',
        uiTarsVersion: UITarsModelVersion.V1_0,
      },
    );
  });

  it('should correctly parse "vlm-ui-tars-doubao"', () => {
    expect(
      parseVlModeAndUiTarsModelVersionFromRawValue('vlm-ui-tars-doubao'),
    ).toEqual({
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    });
  });

  it('should correctly parse "vlm-ui-tars-doubao-1.5"', () => {
    expect(
      parseVlModeAndUiTarsModelVersionFromRawValue('vlm-ui-tars-doubao-1.5'),
    ).toEqual({
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    });
  });

  it('should correctly parse "doubao-vision"', () => {
    expect(
      parseVlModeAndUiTarsModelVersionFromRawValue('doubao-vision'),
    ).toEqual({
      vlMode: 'doubao-vision',
      uiTarsVersion: undefined,
    });
  });

  it('should correctly parse "gemini"', () => {
    expect(parseVlModeAndUiTarsModelVersionFromRawValue('gemini')).toEqual({
      vlMode: 'gemini',
      uiTarsVersion: undefined,
    });
  });

  it('should correctly parse "qwen-vl"', () => {
    expect(parseVlModeAndUiTarsModelVersionFromRawValue('qwen-vl')).toEqual({
      vlMode: 'qwen-vl',
      uiTarsVersion: undefined,
    });
  });
});

describe('parseVlModeAndUiTarsFromGlobalConfig', () => {
  it('should return undefined when no vision mode is enabled', () => {
    expect(parseVlModeAndUiTarsFromGlobalConfig({})).toEqual({
      vlMode: undefined,
      uiTarsVersion: undefined,
    });
  });

  it('should throw an error when multiple vision modes are enabled', () => {
    const provider = {
      [MIDSCENE_USE_DOUBAO_VISION]: '1',
      [MIDSCENE_USE_QWEN_VL]: '1',
    };
    expect(() => parseVlModeAndUiTarsFromGlobalConfig(provider)).toThrow(
      'Only one vision mode can be enabled at a time. Currently enabled modes: MIDSCENE_USE_DOUBAO_VISION, MIDSCENE_USE_QWEN_VL. Please disable all but one mode.',
    );
  });

  it('should correctly parse qwen-vl mode', () => {
    const provider = { [MIDSCENE_USE_QWEN_VL]: '1' };
    expect(parseVlModeAndUiTarsFromGlobalConfig(provider)).toEqual({
      vlMode: 'qwen-vl',
      uiTarsVersion: undefined,
    });
  });

  it('should correctly parse doubao-vision mode', () => {
    const provider = { [MIDSCENE_USE_DOUBAO_VISION]: '1' };
    expect(parseVlModeAndUiTarsFromGlobalConfig(provider)).toEqual({
      vlMode: 'doubao-vision',
      uiTarsVersion: undefined,
    });
  });

  it('should correctly parse gemini mode', () => {
    const provider = { [MIDSCENE_USE_GEMINI]: '1' };
    expect(parseVlModeAndUiTarsFromGlobalConfig(provider)).toEqual({
      vlMode: 'gemini',
      uiTarsVersion: undefined,
    });
  });

  it('should correctly parse vlm-ui-tars mode with version 1.0', () => {
    const provider = { [MIDSCENE_USE_VLM_UI_TARS]: '1' };
    expect(parseVlModeAndUiTarsFromGlobalConfig(provider)).toEqual({
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.V1_0,
    });
  });

  it('should correctly parse vlm-ui-tars mode with DOUBAO', () => {
    const provider = { [MIDSCENE_USE_VLM_UI_TARS]: 'DOUBAO' };
    expect(parseVlModeAndUiTarsFromGlobalConfig(provider)).toEqual({
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    });
  });

  it('should correctly parse vlm-ui-tars mode with DOUBAO-1.5', () => {
    const provider = { [MIDSCENE_USE_VLM_UI_TARS]: 'DOUBAO-1.5' };
    expect(parseVlModeAndUiTarsFromGlobalConfig(provider)).toEqual({
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    });
  });

  it('should correctly parse vlm-ui-tars mode with a specific version', () => {
    const provider = { [MIDSCENE_USE_VLM_UI_TARS]: '1.5' };
    expect(parseVlModeAndUiTarsFromGlobalConfig(provider)).toEqual({
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.V1_5,
    });
  });
});

describe('inferPlanningStyleFromModelName', () => {
  it('should return undefined for empty model name', () => {
    expect(inferPlanningStyleFromModelName(undefined)).toBeUndefined();
    expect(inferPlanningStyleFromModelName('')).toBeUndefined();
  });

  it('should infer qwen-vl from model name', () => {
    expect(inferPlanningStyleFromModelName('qwen2.5-vl-72b')).toBe('qwen-vl');
    expect(inferPlanningStyleFromModelName('Qwen2.5-VL')).toBe('qwen-vl');
    expect(inferPlanningStyleFromModelName('qwen-vl-plus')).toBe('qwen-vl');
    expect(inferPlanningStyleFromModelName('qwen-vl-max')).toBe('qwen-vl');
  });

  it('should infer qwen3-vl from model name', () => {
    expect(inferPlanningStyleFromModelName('qwen3-vl-72b')).toBe('qwen3-vl');
    expect(inferPlanningStyleFromModelName('Qwen3-VL')).toBe('qwen3-vl');
  });

  it('should infer doubao-vision from model name', () => {
    expect(inferPlanningStyleFromModelName('doubao-vision-pro')).toBe(
      'doubao-vision',
    );
    expect(inferPlanningStyleFromModelName('Doubao-Vision-1.6')).toBe(
      'doubao-vision',
    );
  });

  it('should infer vlm-ui-tars from model name', () => {
    expect(inferPlanningStyleFromModelName('ui-tars-1.0')).toBe('vlm-ui-tars');
    expect(inferPlanningStyleFromModelName('ui-tars-1.5')).toBe(
      'vlm-ui-tars-doubao-1.5',
    );
    expect(inferPlanningStyleFromModelName('UI-TARS-model')).toBe(
      'vlm-ui-tars-doubao',
    );
    // No version defaults to doubao deployment (Volcengine)
    expect(inferPlanningStyleFromModelName('ui-tars')).toBe(
      'vlm-ui-tars-doubao',
    );
  });

  it('should infer gemini from model name', () => {
    expect(inferPlanningStyleFromModelName('gemini-pro-vision')).toBe('gemini');
    expect(inferPlanningStyleFromModelName('Gemini-1.5-Flash')).toBe('gemini');
  });

  it('should infer default for OpenAI and Claude models', () => {
    expect(inferPlanningStyleFromModelName('gpt-4o')).toBe('default');
    expect(inferPlanningStyleFromModelName('gpt-4')).toBe('default');
    expect(inferPlanningStyleFromModelName('gpt-3.5-turbo')).toBe('default');
    expect(inferPlanningStyleFromModelName('claude-3')).toBe('default');
    expect(inferPlanningStyleFromModelName('o1-preview')).toBe('default');
  });

  it('should return undefined for truly unknown model names', () => {
    expect(inferPlanningStyleFromModelName('unknown-model')).toBeUndefined();
    expect(inferPlanningStyleFromModelName('random-ai-model')).toBeUndefined();
  });
});

describe('convertPlanningStyleToVlMode', () => {
  it('should convert default to qwen3-vl', () => {
    expect(convertPlanningStyleToVlMode('default')).toEqual({
      vlModeRaw: 'qwen3-vl',
      vlMode: 'qwen3-vl',
      uiTarsVersion: undefined,
    });
  });

  it('should convert qwen3-vl directly', () => {
    expect(convertPlanningStyleToVlMode('qwen3-vl')).toEqual({
      vlModeRaw: 'qwen3-vl',
      vlMode: 'qwen3-vl',
      uiTarsVersion: undefined,
    });
  });

  it('should convert qwen-vl directly', () => {
    expect(convertPlanningStyleToVlMode('qwen-vl')).toEqual({
      vlModeRaw: 'qwen-vl',
      vlMode: 'qwen-vl',
      uiTarsVersion: undefined,
    });
  });

  it('should convert doubao-vision directly', () => {
    expect(convertPlanningStyleToVlMode('doubao-vision')).toEqual({
      vlModeRaw: 'doubao-vision',
      vlMode: 'doubao-vision',
      uiTarsVersion: undefined,
    });
  });

  it('should convert vlm-ui-tars directly', () => {
    expect(convertPlanningStyleToVlMode('vlm-ui-tars')).toEqual({
      vlModeRaw: 'vlm-ui-tars',
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.V1_0,
    });
  });

  it('should convert vlm-ui-tars-doubao-1.5 directly', () => {
    expect(convertPlanningStyleToVlMode('vlm-ui-tars-doubao-1.5')).toEqual({
      vlModeRaw: 'vlm-ui-tars-doubao-1.5',
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    });
  });

  it('should convert gemini directly', () => {
    expect(convertPlanningStyleToVlMode('gemini')).toEqual({
      vlModeRaw: 'gemini',
      vlMode: 'gemini',
      uiTarsVersion: undefined,
    });
  });
});

describe('parsePlanningStyleFromEnv', () => {
  it('should parse new MIDSCENE_PLANNING_STYLE correctly', () => {
    const provider = { [MIDSCENE_PLANNING_STYLE]: 'qwen3-vl' };
    const result = parsePlanningStyleFromEnv(provider);

    expect(result.vlMode).toBe('qwen3-vl');
    expect(result.planningStyle).toBe('qwen3-vl');
    expect(result.warnings).toHaveLength(0);
  });

  it('should throw error for invalid MIDSCENE_PLANNING_STYLE value', () => {
    const provider = { [MIDSCENE_PLANNING_STYLE]: 'invalid-style' };

    expect(() => parsePlanningStyleFromEnv(provider)).toThrow(
      'Invalid MIDSCENE_PLANNING_STYLE value',
    );
  });

  it('should throw error when both new and legacy variables are set', () => {
    const provider = {
      [MIDSCENE_PLANNING_STYLE]: 'qwen3-vl',
      [MIDSCENE_USE_QWEN3_VL]: '1',
    };

    expect(() => parsePlanningStyleFromEnv(provider)).toThrow(
      'Conflicting configuration detected',
    );
  });

  it('should warn when using legacy variables', () => {
    const provider = { [MIDSCENE_USE_QWEN3_VL]: '1' };
    const result = parsePlanningStyleFromEnv(provider);

    expect(result.vlMode).toBe('qwen3-vl');
    expect(result.planningStyle).toBe('qwen3-vl');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('DEPRECATED');
  });

  it('should infer from model name when no config is set', () => {
    const provider = {};
    const result = parsePlanningStyleFromEnv(provider, 'qwen3-vl-72b');

    expect(result.vlMode).toBe('qwen3-vl');
    expect(result.planningStyle).toBe('qwen3-vl');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('inferred');
  });

  it('should throw error when cannot infer from model name', () => {
    const provider = {};

    expect(() =>
      parsePlanningStyleFromEnv(provider, 'unknown-model-xyz'),
    ).toThrow('Unable to infer planning style');
  });

  it('should throw error when no config and no model name', () => {
    const provider = {};

    expect(() => parsePlanningStyleFromEnv(provider)).toThrow(
      'MIDSCENE_PLANNING_STYLE is required',
    );
  });

  it('should handle all planning style values', () => {
    const testCases = [
      { style: 'default', expectedMode: 'qwen3-vl' },
      { style: 'qwen3-vl', expectedMode: 'qwen3-vl' },
      { style: 'qwen-vl', expectedMode: 'qwen-vl' },
      { style: 'doubao-vision', expectedMode: 'doubao-vision' },
      { style: 'vlm-ui-tars', expectedMode: 'vlm-ui-tars' },
      { style: 'vlm-ui-tars-doubao', expectedMode: 'vlm-ui-tars' },
      { style: 'vlm-ui-tars-doubao-1.5', expectedMode: 'vlm-ui-tars' },
      { style: 'gemini', expectedMode: 'gemini' },
    ];

    testCases.forEach(({ style, expectedMode }) => {
      const provider = { [MIDSCENE_PLANNING_STYLE]: style };
      const result = parsePlanningStyleFromEnv(provider);

      expect(result.vlMode).toBe(expectedMode);
      expect(result.planningStyle).toBe(style);
    });
  });
});
