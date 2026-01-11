import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIDSCENE_ADB_PATH,
  MIDSCENE_CACHE,
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_MAX_TOKENS,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_PREFERRED_LANGUAGE,
  ModelConfigManager,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '../../../src/env';
import { GlobalConfigManager } from '../../../src/env/global-config-manager';

describe('overrideAIConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should throw if called with invalid key', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(() =>
      globalConfigManager.overrideAIConfig({
        // @ts-expect-error MIDSCENE_RUN_DEBUG is truly not a valid key
        MIDSCENE_RUN_DEBUG: 'true',
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: Failed to override AI config, invalid key: MIDSCENE_RUN_DEBUG]',
    );
  });

  it('should throw if called with non-string value', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(() =>
      globalConfigManager.overrideAIConfig({
        [MIDSCENE_MODEL_NAME]: 123 as any,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: Failed to override AI config, value for key MIDSCENE_MODEL_NAME must be a string, but got with type number]',
    );

    expect(() =>
      globalConfigManager.overrideAIConfig({
        [MIDSCENE_MODEL_NAME]: true as any,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: Failed to override AI config, value for key MIDSCENE_MODEL_NAME must be a string, but got with type boolean]',
    );

    expect(() =>
      globalConfigManager.overrideAIConfig({
        [MIDSCENE_MODEL_NAME]: {} as any,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: Failed to override AI config, value for key MIDSCENE_MODEL_NAME must be a string, but got with type object]',
    );
  });

  it('should accept valid GLOBAL_ENV_KEYS', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(() =>
      globalConfigManager.overrideAIConfig({
        [MIDSCENE_ADB_PATH]: '/custom/adb/path',
        [MIDSCENE_CACHE]: 'true',
        [MIDSCENE_MODEL_MAX_TOKENS]: '200',
        [MIDSCENE_PREFERRED_LANGUAGE]: 'zh-CN',
      }),
    ).not.toThrow();
  });

  it('should accept valid MODEL_ENV_KEYS', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(() =>
      globalConfigManager.overrideAIConfig({
        [MIDSCENE_MODEL_NAME]: 'gpt-4',
        [MIDSCENE_MODEL_API_KEY]: 'sk-test-key',
        [MIDSCENE_MODEL_BASE_URL]: 'https://api.openai.com/v1',
        [OPENAI_API_KEY]: 'sk-legacy-key',
        [OPENAI_BASE_URL]: 'https://api.openai.com/v1',
      }),
    ).not.toThrow();
  });

  it('should override config values in non-extend mode (default)', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    // Set initial environment values
    vi.stubEnv(MIDSCENE_ADB_PATH, '/original/adb/path');
    vi.stubEnv(MIDSCENE_CACHE, 'false');
    vi.stubEnv(MIDSCENE_MODEL_NAME, 'gpt-3.5-turbo');

    // Override with new values
    globalConfigManager.overrideAIConfig({
      [MIDSCENE_ADB_PATH]: '/override/adb/path',
      [MIDSCENE_CACHE]: 'true',
      [MIDSCENE_MODEL_NAME]: 'gpt-4',
    });

    // Should return overridden values, not original env values
    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '/override/adb/path',
    );
    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      true,
    );
    // Note: MIDSCENE_MODEL_NAME is not accessible via getEnvConfigValue as it's not in STRING_ENV_KEYS
  });

  it('should merge config values in extend mode', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    // Set initial environment values
    vi.stubEnv(MIDSCENE_ADB_PATH, '/original/adb/path');
    vi.stubEnv(MIDSCENE_CACHE, 'false');
    vi.stubEnv(MIDSCENE_MODEL_MAX_TOKENS, '100');

    // Override with extend mode
    globalConfigManager.overrideAIConfig(
      {
        [MIDSCENE_ADB_PATH]: '/override/adb/path',
        [MIDSCENE_CACHE]: 'true',
      },
      true, // extendMode = true
    );

    // Should return overridden values for specified keys
    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '/override/adb/path',
    );
    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      true,
    );
    // Should return original env values for non-overridden keys
    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(100);
  });

  it('should warn when overriding already read keys', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    // Read a key first
    globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH);

    // Now try to override it
    globalConfigManager.overrideAIConfig({
      [MIDSCENE_ADB_PATH]: '/new/adb/path',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Warning: try to override AI config with key MIDSCENE_ADB_PATH ,but it has been read.',
    );

    consoleSpy.mockRestore();
  });

  it('should handle multiple override calls', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    // First override
    globalConfigManager.overrideAIConfig({
      [MIDSCENE_ADB_PATH]: '/first/override',
      [MIDSCENE_CACHE]: 'true',
    });

    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '/first/override',
    );
    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      true,
    );

    // Second override (should replace first)
    globalConfigManager.overrideAIConfig({
      [MIDSCENE_ADB_PATH]: '/second/override',
      [MIDSCENE_MODEL_MAX_TOKENS]: '300',
    });

    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '/second/override',
    );
    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(300);
    // Previous override should be lost in non-extend mode
    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      false, // back to default since not in second override
    );
  });

  it('should handle multiple override calls in extend mode', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    // Set initial environment values
    vi.stubEnv(MIDSCENE_ADB_PATH, '/env/adb/path');
    vi.stubEnv(MIDSCENE_CACHE, 'false');

    // First override in extend mode
    globalConfigManager.overrideAIConfig(
      {
        [MIDSCENE_ADB_PATH]: '/first/override',
        [MIDSCENE_CACHE]: 'true',
      },
      true,
    );

    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '/first/override',
    );
    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      true,
    );

    // Second override in extend mode (should merge with first)
    globalConfigManager.overrideAIConfig(
      {
        [MIDSCENE_ADB_PATH]: '/second/override',
        [MIDSCENE_MODEL_MAX_TOKENS]: '300',
      },
      true,
    );

    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '/second/override',
    );
    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(300);
    // Previous override should be preserved in extend mode
    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      true,
    );
  });

  it('should invalidate cached config when override is called', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    // Set initial environment values
    vi.stubEnv(MIDSCENE_ADB_PATH, '/original/path');

    // Get config to cache it
    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '/original/path',
    );

    // Override config
    globalConfigManager.overrideAIConfig({
      [MIDSCENE_ADB_PATH]: '/new/path',
    });

    // Should return new value, not cached original value
    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '/new/path',
    );
  });

  it('should clear model config map when override is called', () => {
    const modelConfigManager = new ModelConfigManager();
    const clearModelConfigMapSpy = vi.spyOn(
      modelConfigManager,
      'clearModelConfigMap',
    );
    const globalConfigManager = new GlobalConfigManager();

    globalConfigManager.registerModelConfigManager(modelConfigManager);

    globalConfigManager.overrideAIConfig({
      [MIDSCENE_MODEL_NAME]: 'gpt-4',
    });

    expect(clearModelConfigMapSpy).toHaveBeenCalled();
  });

  it('should handle empty override config', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(() => globalConfigManager.overrideAIConfig({})).not.toThrow();
  });
});

describe('getEnvConfigValueAsNumber', () => {
  beforeEach(() => {
    vi.stubEnv(MIDSCENE_ADB_PATH, '<test-adb-path>');
    vi.stubEnv(MIDSCENE_MODEL_MAX_TOKENS, '100');
    vi.stubEnv(MIDSCENE_CACHE, '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return number for valid numeric string values', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(100);
  });

  it('should return undefined for non-numeric string values', () => {
    vi.stubEnv(MIDSCENE_ADB_PATH, 'not-a-number');

    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_ADB_PATH),
    ).toBeUndefined();
  });

  it('should return undefined for unset environment variables', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(
        MIDSCENE_PREFERRED_LANGUAGE,
      ),
    ).toBeUndefined();
  });

  it('should return undefined for empty string values', () => {
    vi.stubEnv(MIDSCENE_MODEL_MAX_TOKENS, '');

    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBeUndefined();
  });

  it('should handle decimal values', () => {
    vi.stubEnv(MIDSCENE_MODEL_MAX_TOKENS, '123.45');

    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(123.45);
  });

  it('should handle zero values', () => {
    vi.stubEnv(MIDSCENE_MODEL_MAX_TOKENS, '0');

    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(0);
  });

  it('should handle negative values', () => {
    vi.stubEnv(MIDSCENE_MODEL_MAX_TOKENS, '-100');

    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(-100);
  });

  it('should trim whitespace before conversion', () => {
    vi.stubEnv(MIDSCENE_MODEL_MAX_TOKENS, '  100  ');

    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(100);
  });

  it('should work with override config', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    // Initially not set
    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(100); // from beforeEach

    // Override with new value
    globalConfigManager.overrideAIConfig({
      [MIDSCENE_MODEL_MAX_TOKENS]: '200',
    });

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(200);
  });

  it('should throw if key is not a supported numeric key', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(() =>
      globalConfigManager.getEnvConfigValueAsNumber(
        // @ts-expect-error MIDSCENE_CACHE is truly not a valid string key (it's boolean)
        MIDSCENE_CACHE,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: getEnvConfigValueAsNumber with key MIDSCENE_CACHE is not supported.]',
    );
  });
});

describe('getEnvConfigValue', () => {
  beforeEach(() => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<test-model>');
    vi.stubEnv(OPENAI_API_KEY, '<test-openai-api-key>');
    vi.stubEnv(OPENAI_BASE_URL, '<test-openai-base-url>');
    // Reset MIDSCENE_CACHE to ensure tests start with clean state
    vi.stubEnv(MIDSCENE_CACHE, '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should throw if key is not supported', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(() =>
      globalConfigManager.getEnvConfigValue(
        // @ts-expect-error MIDSCENE_MODEL_NAME is truly not a valid key
        MIDSCENE_MODEL_NAME,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: getEnvConfigValue with key MIDSCENE_MODEL_NAME is not supported.]',
    );

    expect(() =>
      globalConfigManager.getEnvConfigValueAsNumber(
        // @ts-expect-error MIDSCENE_MODEL_NAME is truly not a valid key
        MIDSCENE_MODEL_NAME,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: getEnvConfigValueAsNumber with key MIDSCENE_MODEL_NAME is not supported.]',
    );

    expect(() =>
      globalConfigManager.getEnvConfigInBoolean(
        // @ts-expect-error MIDSCENE_MODEL_NAME is truly not a valid key
        MIDSCENE_MODEL_NAME,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: getEnvConfigInBoolean with key MIDSCENE_MODEL_NAME is not supported]',
    );
  });

  it('should return the correct value from process.env', () => {
    vi.stubEnv(MIDSCENE_ADB_PATH, '<test-adb-path>');
    vi.stubEnv(MIDSCENE_MODEL_MAX_TOKENS, '100');
    vi.stubEnv(MIDSCENE_CACHE, 'true');

    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '<test-adb-path>',
    );

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(100);

    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      true,
    );
  });
  it('should return the correct value from override', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(
      globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH),
    ).toBeUndefined();

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBeUndefined();

    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      false,
    );

    globalConfigManager.overrideAIConfig({
      [MIDSCENE_ADB_PATH]: '<override-adb-path>',
      [MIDSCENE_MODEL_MAX_TOKENS]: '100',
      [MIDSCENE_CACHE]: 'true',
    });

    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '<override-adb-path>',
    );

    expect(
      globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS),
    ).toBe(100);

    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      true,
    );
  });
});
