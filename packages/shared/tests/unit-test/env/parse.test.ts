import { describe, expect, it } from 'vitest';
import {
  legacyConfigToModelFamily,
  modelFamilyToVLConfig,
} from '../../../src/env/parse-model-config';
import { UITarsModelVersion } from '../../../src/env/types';
import {
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_GEMINI,
  MIDSCENE_USE_QWEN3_VL,
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
} from '../../../src/env/types';

describe('modelFamilyToVLConfig', () => {
  it('should return empty values when model family is missing', () => {
    expect(modelFamilyToVLConfig()).toEqual({
      vlMode: undefined,
      uiTarsVersion: undefined,
    });
  });

  it('should map ui-tars variants to correct version', () => {
    expect(modelFamilyToVLConfig('vlm-ui-tars')).toEqual({
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.V1_0,
    });

    expect(modelFamilyToVLConfig('vlm-ui-tars-doubao')).toEqual({
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    });

    expect(modelFamilyToVLConfig('vlm-ui-tars-doubao-1.5')).toEqual({
      vlMode: 'vlm-ui-tars',
      uiTarsVersion: UITarsModelVersion.DOUBAO_1_5_20B,
    });
  });

  it('should map other model families directly', () => {
    expect(modelFamilyToVLConfig('qwen3-vl')).toEqual({
      vlMode: 'qwen3-vl',
      uiTarsVersion: undefined,
    });
    expect(modelFamilyToVLConfig('doubao-vision')).toEqual({
      vlMode: 'doubao-vision',
      uiTarsVersion: undefined,
    });
    expect(modelFamilyToVLConfig('gemini')).toEqual({
      vlMode: 'gemini',
      uiTarsVersion: undefined,
    });
    expect(modelFamilyToVLConfig('glm-v')).toEqual({
      vlMode: 'glm-v',
      uiTarsVersion: undefined,
    });
  });

  it('should allow gpt-5 without vlMode', () => {
    expect(modelFamilyToVLConfig('gpt-5')).toEqual({
      vlMode: undefined,
      uiTarsVersion: undefined,
    });
  });

  it('should throw on invalid value', () => {
    expect(() => modelFamilyToVLConfig('invalid' as any)).toThrow(
      'Invalid MIDSCENE_MODEL_FAMILY value: invalid',
    );
  });
});

describe('legacyConfigToModelFamily', () => {
  it('should return undefined when no legacy vars set', () => {
    expect(legacyConfigToModelFamily({})).toBeUndefined();
  });

  it('should map individual legacy flags to model family', () => {
    expect(legacyConfigToModelFamily({ [MIDSCENE_USE_QWEN3_VL]: '1' })).toBe(
      'qwen3-vl',
    );
    expect(legacyConfigToModelFamily({ [MIDSCENE_USE_QWEN_VL]: '1' })).toBe(
      'qwen2.5-vl',
    );
    expect(
      legacyConfigToModelFamily({ [MIDSCENE_USE_DOUBAO_VISION]: '1' }),
    ).toBe('doubao-vision');
    expect(legacyConfigToModelFamily({ [MIDSCENE_USE_GEMINI]: '1' })).toBe(
      'gemini',
    );
  });

  it('should handle UI-TARS legacy flags', () => {
    expect(legacyConfigToModelFamily({ [MIDSCENE_USE_VLM_UI_TARS]: '1' })).toBe(
      'vlm-ui-tars',
    );
    expect(
      legacyConfigToModelFamily({ [MIDSCENE_USE_VLM_UI_TARS]: 'DOUBAO' }),
    ).toBe('vlm-ui-tars-doubao-1.5');
  });

  it('should throw when multiple legacy flags enabled', () => {
    expect(() =>
      legacyConfigToModelFamily({
        [MIDSCENE_USE_QWEN3_VL]: '1',
        [MIDSCENE_USE_QWEN_VL]: '1',
      }),
    ).toThrow('Only one vision mode can be enabled at a time.');
  });
});
