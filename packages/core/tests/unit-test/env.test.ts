import {
  MATCH_BY_POSITION,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_USE_DOUBAO_VISION,
  MIDSCENE_USE_QWEN_VL,
  MIDSCENE_USE_VLM_UI_TARS,
  MIDSCENE_USE_VL_MODEL,
  getAIConfig,
  getAIConfigInBoolean,
  getAIConfigInJson,
  overrideAIConfig,
  vlLocateMode,
} from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('env', () => {
  // backup original environment variables
  const originalEnv = { ...process.env };

  // clean up before each test
  beforeEach(() => {
    // reset to empty object, avoid interference between tests
    overrideAIConfig({}, false);
  });

  // restore environment variables after each test
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getAIConfig', () => {
    it('should get config value from global config', () => {
      overrideAIConfig({ [MIDSCENE_MODEL_NAME]: 'test-model' });
      expect(getAIConfig(MIDSCENE_MODEL_NAME)).toBe('test-model');
    });

    it('should trim config value', () => {
      overrideAIConfig({ [MIDSCENE_MODEL_NAME]: '  test-model  ' });
      expect(getAIConfig(MIDSCENE_MODEL_NAME)).toBe('test-model');
    });

    it('should return undefined for non-existent config key', () => {
      expect(getAIConfig(MIDSCENE_MODEL_NAME)).toBeUndefined();
    });

    it('should throw error when trying to get MATCH_BY_POSITION', () => {
      expect(() => getAIConfig(MATCH_BY_POSITION)).toThrow(
        'MATCH_BY_POSITION is deprecated',
      );
    });
  });

  describe('getAIConfigInBoolean', () => {
    it('should convert "true" to boolean true', () => {
      overrideAIConfig({ [MIDSCENE_USE_QWEN_VL]: 'true' });
      expect(getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)).toBe(true);
    });

    it('should convert "1" to boolean true', () => {
      overrideAIConfig({ [MIDSCENE_USE_QWEN_VL]: '1' });
      expect(getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)).toBe(true);
    });

    it('should convert other values to boolean false', () => {
      overrideAIConfig({ [MIDSCENE_USE_QWEN_VL]: 'false' });
      expect(getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)).toBe(false);

      overrideAIConfig({ [MIDSCENE_USE_QWEN_VL]: '0' });
      expect(getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)).toBe(false);

      overrideAIConfig({ [MIDSCENE_USE_QWEN_VL]: 'anything' });
      expect(getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)).toBe(false);
    });

    it('should return false for non-existent config', () => {
      expect(getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)).toBe(false);
    });
  });

  describe('getAIConfigInJson', () => {
    it('should parse valid JSON string', () => {
      const jsonConfig = '{"key": "value", "number": 123}';
      overrideAIConfig({ [MIDSCENE_MODEL_NAME]: jsonConfig });
      expect(getAIConfigInJson(MIDSCENE_MODEL_NAME)).toEqual({
        key: 'value',
        number: 123,
      });
    });

    it('should return undefined for non-existent config key', () => {
      expect(getAIConfigInJson(MIDSCENE_MODEL_NAME)).toBeUndefined();
    });

    it('should throw error for invalid JSON', () => {
      overrideAIConfig({ [MIDSCENE_MODEL_NAME]: '{invalid json}' });
      expect(() => getAIConfigInJson(MIDSCENE_MODEL_NAME)).toThrow(
        'Failed to parse json config',
      );
    });
  });

  describe('overrideAIConfig', () => {
    it('should extend global config when extendMode is true', () => {
      overrideAIConfig({ [MIDSCENE_MODEL_NAME]: 'model-1' });
      overrideAIConfig({ [MIDSCENE_USE_QWEN_VL]: 'true' }, true);

      expect(getAIConfig(MIDSCENE_MODEL_NAME)).toBe('model-1');
      expect(getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)).toBe(true);
    });

    it('should replace global config when extendMode is false', () => {
      overrideAIConfig({
        [MIDSCENE_MODEL_NAME]: 'model-1',
        [MIDSCENE_USE_QWEN_VL]: 'true',
      });

      overrideAIConfig({ [MIDSCENE_MODEL_NAME]: 'model-2' }, false);

      expect(getAIConfig(MIDSCENE_MODEL_NAME)).toBe('model-2');
      expect(getAIConfig(MIDSCENE_USE_QWEN_VL)).toBeUndefined();
    });

    it('should convert numeric keys to strings without error', () => {
      // numeric keys will be converted to strings automatically in JavaScript, without throwing an error
      // @ts-ignore - test the behavior by using a numeric key
      expect(() => overrideAIConfig({ [123]: 'value' })).not.toThrow();
    });

    it('should throw error for object value', () => {
      expect(() =>
        overrideAIConfig({
          // @ts-expect-error - test the behavior by using an object value
          [MIDSCENE_MODEL_NAME]: { key: 'value' },
        }),
      ).toThrow('invalid value');
    });
  });

  describe('vlLocateMode', () => {
    it('should return false when no VL mode is enabled', () => {
      expect(vlLocateMode()).toBe(false);
    });

    it('should return "qwen-vl" when MIDSCENE_USE_QWEN_VL is true', () => {
      overrideAIConfig({ [MIDSCENE_USE_QWEN_VL]: 'true' });
      expect(vlLocateMode()).toBe('qwen-vl');
    });

    it('should return "doubao-vision" when MIDSCENE_USE_DOUBAO_VISION is true', () => {
      overrideAIConfig({ [MIDSCENE_USE_DOUBAO_VISION]: 'true' });
      expect(vlLocateMode()).toBe('doubao-vision');
    });

    it('should return "vl-model" when MIDSCENE_USE_VL_MODEL is true', () => {
      overrideAIConfig({ [MIDSCENE_USE_VL_MODEL]: 'true' });
      expect(vlLocateMode()).toBe('vl-model');
    });

    it('should return "vlm-ui-tars" when MIDSCENE_USE_VLM_UI_TARS is true', () => {
      overrideAIConfig({ [MIDSCENE_USE_VLM_UI_TARS]: 'true' });
      expect(vlLocateMode()).toBe('vlm-ui-tars');
    });

    it('should throw error when multiple VL modes are enabled', () => {
      overrideAIConfig({
        [MIDSCENE_USE_QWEN_VL]: 'true',
        [MIDSCENE_USE_DOUBAO_VISION]: 'true',
      });

      expect(() => vlLocateMode()).toThrow(
        'Only one vision mode can be enabled at a time',
      );
    });
  });
});
