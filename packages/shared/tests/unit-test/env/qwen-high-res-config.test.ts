import { describe, it, expect } from 'vitest';
import { parseModelProvider } from '../../../src/env/parse';

describe('QWEN High Resolution Configuration', () => {
  it('should parse QWEN high resolution flag when enabled', () => {
    const provider = {
      MIDSCENE_USE_QWEN_VL: 'qwen-vl-plus',
      MIDSCENE_USE_QWEN_HIGH_RES: 'true',
    };

    const result = parseModelProvider(provider);
    expect(result.vlMode).toBe('qwen-vl');
    expect(result.qwenHighResolution).toBe(true);
  });

  it('should parse QWEN high resolution flag when disabled', () => {
    const provider = {
      MIDSCENE_USE_QWEN3_VL: 'qwen3-vl-plus',
      MIDSCENE_USE_QWEN_HIGH_RES: 'false',
    };

    const result = parseModelProvider(provider);
    expect(result.vlMode).toBe('qwen3-vl');
    expect(result.qwenHighResolution).toBe(false);
  });

  it('should default to undefined when QWEN high resolution flag not specified', () => {
    const provider = {
      MIDSCENE_USE_QWEN_VL: 'qwen-vl-plus',
    };

    const result = parseModelProvider(provider);
    expect(result.vlMode).toBe('qwen-vl');
    expect(result.qwenHighResolution).toBeUndefined();
  });

  it('should handle QWEN high resolution flag with non-QWEN models', () => {
    const provider = {
      MIDSCENE_USE_GEMINI: 'gemini-pro',
      MIDSCENE_USE_QWEN_HIGH_RES: 'true',
    };

    const result = parseModelProvider(provider);
    expect(result.qwenHighResolution).toBe(true);
  });

  it('should handle various truthy values for QWEN high resolution flag', () => {
    const truthyValues = ['true', '1', 'yes', 'on', 'TRUE', 'True'];
    
    for (const value of truthyValues) {
      const provider = {
        MIDSCENE_USE_QWEN_VL: 'qwen-vl-plus',
        MIDSCENE_USE_QWEN_HIGH_RES: value,
      };

      const result = parseModelProvider(provider);
      expect(result.qwenHighResolution).toBe(true);
    }
  });

  it('should handle various falsy values for QWEN high resolution flag', () => {
    const falsyValues = ['false', '0', 'no', 'off', 'FALSE', 'False', ''];
    
    for (const value of falsyValues) {
      const provider = {
        MIDSCENE_USE_QWEN_VL: 'qwen-vl-plus',
        MIDSCENE_USE_QWEN_HIGH_RES: value,
      };

      const result = parseModelProvider(provider);
      expect(result.qwenHighResolution).toBe(false);
    }
  });

  it('should integrate env parsing with model config for end-to-end flow', () => {
    // Test that environment variable parsing flows through to model configuration
    const envWithEnabled = {
      MIDSCENE_USE_QWEN_VL: 'qwen-vl-plus',
      MIDSCENE_USE_QWEN_HIGH_RES: 'true',
    };

    const envWithDisabled = {
      MIDSCENE_USE_QWEN_VL: 'qwen-vl-plus', 
      MIDSCENE_USE_QWEN_HIGH_RES: 'false',
    };

    const enabledResult = parseModelProvider(envWithEnabled);
    const disabledResult = parseModelProvider(envWithDisabled);

    // Verify that parsed values would correctly influence service caller behavior
    expect(enabledResult.qwenHighResolution).toBe(true);
    expect(disabledResult.qwenHighResolution).toBe(false);
    expect(enabledResult.vlMode).toBe('qwen-vl');
    expect(disabledResult.vlMode).toBe('qwen-vl');
  });
});
