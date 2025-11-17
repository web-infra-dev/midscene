import { describe, expect, it } from 'vitest';
import { UITarsModelVersion } from '../../../src/env/';
import {
  convertModelFamilyToVlMode,
  parseModelFamilyFromEnv,
  parseVlModeAndUiTarsFromGlobalConfig,
  parseVlModeAndUiTarsModelVersionFromRawValue,
} from '../../../src/env/parse';
import {
  MIDSCENE_MODEL_FAMILY,
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
    expect(parseVlModeAndUiTarsModelVersionFromRawValue('qwen2.5-vl')).toEqual({
      vlMode: 'qwen2.5-vl',
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
      vlMode: 'qwen2.5-vl',
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

describe('convertModelFamilyToVlMode', () => {
  it('should convert qwen3-vl directly', () => {
    expect(convertModelFamilyToVlMode('qwen3-vl')).toEqual({
      vlModeRaw: 'qwen3-vl',
      vlMode: 'qwen3-vl',
      uiTarsVersion: undefined,
    });
  });

  it('should convert qwen-vl directly', () => {
    expect(convertModelFamilyToVlMode('qwen2.5-vl')).toEqual({
      vlModeRaw: 'qwen2.5-vl',
      vlMode: 'qwen2.5-vl',
      uiTarsVersion: undefined,
    });
  });

  it('should convert doubao-vision directly', () => {
    expect(convertModelFamilyToVlMode('doubao-vision')).toEqual({
      vlModeRaw: 'doubao-vision',
      vlMode: 'doubao-vision',
      uiTarsVersion: undefined,
    });
  });

  it('should convert vlm-ui-tars directly', () => {
    expect(convertModelFamilyToVlMode('vlm-ui-tars')).toEqual({
      vlModeRaw: 'vlm-ui-tars',
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.V1_0,
    });
  });

  it('should convert vlm-ui-tars-doubao-1.5 directly', () => {
    expect(convertModelFamilyToVlMode('vlm-ui-tars-doubao-1.5')).toEqual({
      vlModeRaw: 'vlm-ui-tars-doubao-1.5',
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    });
  });

  it('should convert gemini directly', () => {
    expect(convertModelFamilyToVlMode('gemini')).toEqual({
      vlModeRaw: 'gemini',
      vlMode: 'gemini',
      uiTarsVersion: undefined,
    });
  });
});

describe('parseModelFamilyFromEnv', () => {
  it('should parse new MIDSCENE_MODEL_FAMILY correctly', () => {
    const provider = { [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl' };
    const result = parseModelFamilyFromEnv(provider);

    expect(result.vlMode).toBe('qwen3-vl');
    expect(result.modelFamily).toBe('qwen3-vl');
    expect(result.warnings).toHaveLength(0);
  });

  it('should throw error for invalid MIDSCENE_MODEL_FAMILY value', () => {
    const provider = { [MIDSCENE_MODEL_FAMILY]: 'invalid-style' };

    expect(() => parseModelFamilyFromEnv(provider)).toThrow(
      'Invalid MIDSCENE_MODEL_FAMILY value',
    );
  });

  it('should throw error when both new and legacy variables are set', () => {
    const provider = {
      [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
      [MIDSCENE_USE_QWEN3_VL]: '1',
    };

    expect(() => parseModelFamilyFromEnv(provider)).toThrow(
      'Conflicting configuration detected',
    );
  });

  it('should warn when using legacy variables', () => {
    const provider = { [MIDSCENE_USE_QWEN3_VL]: '1' };
    const result = parseModelFamilyFromEnv(provider);

    expect(result.vlMode).toBe('qwen3-vl');
    expect(result.modelFamily).toBe('qwen3-vl');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('DEPRECATED');
  });

  it('should throw error when no config is set', () => {
    const provider = {};

    expect(() => parseModelFamilyFromEnv(provider)).toThrow(
      'MIDSCENE_MODEL_FAMILY is required',
    );
  });

  it('should handle all planning style values', () => {
    const testCases = [
      { style: 'qwen3-vl', expectedMode: 'qwen3-vl' },
      { style: 'qwen2.5-vl', expectedMode: 'qwen2.5-vl' },
      { style: 'doubao-vision', expectedMode: 'doubao-vision' },
      { style: 'vlm-ui-tars', expectedMode: 'vlm-ui-tars' },
      { style: 'vlm-ui-tars-doubao', expectedMode: 'vlm-ui-tars' },
      { style: 'vlm-ui-tars-doubao-1.5', expectedMode: 'vlm-ui-tars' },
      { style: 'gemini', expectedMode: 'gemini' },
    ];

    testCases.forEach(({ style, expectedMode }) => {
      const provider = { [MIDSCENE_MODEL_FAMILY]: style };
      const result = parseModelFamilyFromEnv(provider);

      expect(result.vlMode).toBe(expectedMode);
      expect(result.modelFamily).toBe(style);
    });
  });
});
