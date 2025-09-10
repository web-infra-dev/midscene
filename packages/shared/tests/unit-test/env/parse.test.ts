import { describe, expect, it } from 'vitest';
import { UITarsModelVersion } from '../../../src/env/';
import {
  parseVlModeAndUiTarsFromGlobalConfig,
  parseVlModeAndUiTarsModelVersionFromRawValue,
} from '../../../src/env/parse';
import {
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_GEMINI,
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
    ).toThrow(
      'the value invalid-mode is not a valid VL_MODE value, must be one of doubao-vision,gemini,qwen-vl,vlm-ui-tars,vlm-ui-tars-doubao,vlm-ui-tars-doubao-1.5',
    );
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
