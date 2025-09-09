import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIDSCENE_ADB_PATH,
  MIDSCENE_CACHE,
  MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_OPENAI_API_KEY,
  MIDSCENE_OPENAI_BASE_URL,
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
        [MIDSCENE_CACHE_MAX_FILENAME_LENGTH]: '200',
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
        [MIDSCENE_OPENAI_API_KEY]: 'sk-test-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
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
    vi.stubEnv(MIDSCENE_CACHE_MAX_FILENAME_LENGTH, '100');

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
      globalConfigManager.getEnvConfigInNumber(
        MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
      ),
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
      [MIDSCENE_CACHE_MAX_FILENAME_LENGTH]: '300',
    });

    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '/second/override',
    );
    expect(
      globalConfigManager.getEnvConfigInNumber(
        MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
      ),
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
        [MIDSCENE_CACHE_MAX_FILENAME_LENGTH]: '300',
      },
      true,
    );

    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '/second/override',
    );
    expect(
      globalConfigManager.getEnvConfigInNumber(
        MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
      ),
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

describe('getEnvConfigValue', () => {
  beforeEach(() => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<test-model>');
    vi.stubEnv(OPENAI_API_KEY, '<test-openai-api-key>');
    vi.stubEnv(OPENAI_BASE_URL, '<test-openai-base-url>');
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
      globalConfigManager.getEnvConfigInNumber(
        // @ts-expect-error MIDSCENE_MODEL_NAME is truly not a valid key
        MIDSCENE_MODEL_NAME,
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: getEnvConfigInNumber with key MIDSCENE_MODEL_NAME is not supported]',
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
    vi.stubEnv(MIDSCENE_CACHE_MAX_FILENAME_LENGTH, '100');
    vi.stubEnv(MIDSCENE_CACHE, 'true');

    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.registerModelConfigManager(new ModelConfigManager());

    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '<test-adb-path>',
    );

    expect(
      globalConfigManager.getEnvConfigInNumber(
        MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
      ),
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
      globalConfigManager.getEnvConfigInNumber(
        MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
      ),
    ).toBe(0);

    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      false,
    );

    globalConfigManager.overrideAIConfig({
      [MIDSCENE_ADB_PATH]: '<override-adb-path>',
      [MIDSCENE_CACHE_MAX_FILENAME_LENGTH]: '100',
      [MIDSCENE_CACHE]: 'true',
    });

    expect(globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH)).toBe(
      '<override-adb-path>',
    );

    expect(
      globalConfigManager.getEnvConfigInNumber(
        MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
      ),
    ).toBe(100);

    expect(globalConfigManager.getEnvConfigInBoolean(MIDSCENE_CACHE)).toBe(
      true,
    );
  });
});
