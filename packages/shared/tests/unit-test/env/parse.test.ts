import { describe, expect, it } from 'vitest';
import {
  getUITarsModelVersion,
  legacyConfigToModelFamily,
  validateModelFamily,
} from '../../../src/env/parse-model-config';
import { UITarsModelVersion } from '../../../src/env/types';
import {
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_GEMINI,
  MIDSCENE_USE_QWEN3_VL,
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
} from '../../../src/env/types';

describe('getUITarsModelVersion', () => {
  it('should return undefined when model family is missing', () => {
    expect(getUITarsModelVersion()).toBeUndefined();
  });

  it('should map ui-tars variants to correct version', () => {
    expect(getUITarsModelVersion('vlm-ui-tars')).toBe(UITarsModelVersion.V1_0);
    expect(getUITarsModelVersion('vlm-ui-tars-doubao')).toBe(
      UITarsModelVersion.DOUBAO_1_5_20B,
    );
    expect(getUITarsModelVersion('vlm-ui-tars-doubao-1.5')).toBe(
      UITarsModelVersion.DOUBAO_1_5_20B,
    );
  });

  it('should return undefined for non-UI-TARS models', () => {
    expect(getUITarsModelVersion('qwen3-vl')).toBeUndefined();
    expect(getUITarsModelVersion('doubao-vision')).toBeUndefined();
    expect(getUITarsModelVersion('gemini')).toBeUndefined();
    expect(getUITarsModelVersion('glm-v')).toBeUndefined();
    expect(getUITarsModelVersion('gpt-5')).toBeUndefined();
  });
});

describe('validateModelFamily', () => {
  it('should not throw on valid model families', () => {
    expect(() => validateModelFamily('qwen3-vl')).not.toThrow();
    expect(() => validateModelFamily('doubao-vision')).not.toThrow();
    expect(() => validateModelFamily('gemini')).not.toThrow();
    expect(() => validateModelFamily('glm-v')).not.toThrow();
    expect(() => validateModelFamily('gpt-5')).not.toThrow();
    expect(() => validateModelFamily('vlm-ui-tars')).not.toThrow();
    expect(() => validateModelFamily(undefined)).not.toThrow();
  });

  it('should throw on invalid value', () => {
    expect(() => validateModelFamily('invalid' as any)).toThrow(
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
