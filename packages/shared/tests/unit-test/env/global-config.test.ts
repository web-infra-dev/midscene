import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIDSCENE_ADB_PATH,
  MIDSCENE_CACHE,
  MIDSCENE_CACHE_MAX_FILENAME_LENGTH,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_OPENAI_API_KEY,
  MIDSCENE_OPENAI_BASE_URL,
  MIDSCENE_PREFERRED_LANGUAGE,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '../../../src/env';
import { GlobalConfigManager } from '../../../src/env/global-config';

describe('overrideAIConfig', () => {
  beforeEach(() => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<test-model>');
    vi.stubEnv(OPENAI_API_KEY, '<test-openai-api-key>');
    vi.stubEnv(OPENAI_BASE_URL, '<test-openai-base-url>');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // skip check temporarily because of globalConfigManager will be refactored to support multiple agents
  it.skip('should throw if called after init', () => {
    const globalConfigManager = new GlobalConfigManager();
    globalConfigManager.init();

    expect(() =>
      globalConfigManager.registerOverride({
        [MIDSCENE_MODEL_NAME]: 'test-model-2',
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: overrideAIConfig must be called before Agent.constructor]',
    );
  });

  it('should throw if called with invalid key', () => {
    const globalConfigManager = new GlobalConfigManager();

    expect(() =>
      globalConfigManager.registerOverride({
        // @ts-expect-error MIDSCENE_RUN_DEBUG is truly not a valid key
        MIDSCENE_RUN_DEBUG: 'true',
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: Failed to override AI config, invalid key: MIDSCENE_RUN_DEBUG]',
    );
  });

  it('should throw if called with invalid value', () => {
    const globalConfigManager = new GlobalConfigManager();

    expect(() =>
      globalConfigManager.registerOverride({
        // @ts-expect-error MIDSCENE_MODEL_NAME is truly not a valid value
        MIDSCENE_MODEL_NAME: 123,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: Failed to override AI config, value for key MIDSCENE_MODEL_NAME must be a string, but got with type number]',
    );
  });

  it('should override global config with extend mode', () => {
    const globalConfigManager = new GlobalConfigManager();

    globalConfigManager.registerOverride(
      {
        [MIDSCENE_PREFERRED_LANGUAGE]: 'foo',
      },
      true,
    );

    globalConfigManager.init();
    expect(
      globalConfigManager.getEnvConfigValue(MIDSCENE_PREFERRED_LANGUAGE),
    ).toBe('foo');
  });

  it('overrideAIConfig default mode is override', () => {
    const globalConfigManager = new GlobalConfigManager();

    globalConfigManager.registerOverride({
      [MIDSCENE_PREFERRED_LANGUAGE]: 'foo',
    });

    // because of the OPENAI_BASE_URL in process.env is override by the override mode
    expect(() => globalConfigManager.init()).toThrowErrorMatchingInlineSnapshot(
      // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
      `[Error: The OPENAI_API_KEY must be a non-empty string, but got: undefined. Please check your config.]`,
    );
  });

  it('overrideAIConfig default mode is override so must pass allConfig as args', () => {
    const globalConfigManager = new GlobalConfigManager();

    globalConfigManager.registerOverride({
      [MIDSCENE_MODEL_NAME]: 'override-model-name',
      [OPENAI_API_KEY]: 'override-openai-api-key',
      [OPENAI_BASE_URL]: 'override-openai-base-url',
      [MIDSCENE_PREFERRED_LANGUAGE]: 'foo',
    });

    globalConfigManager.init();
    expect(
      globalConfigManager.getEnvConfigValue(MIDSCENE_PREFERRED_LANGUAGE),
    ).toBe('foo');

    const { modelName, openaiApiKey, openaiBaseURL } =
      globalConfigManager.getModelConfigByIntent('default');
    expect(modelName).toBe('override-model-name');
    expect(openaiApiKey).toBe('override-openai-api-key');
    expect(openaiBaseURL).toBe('override-openai-base-url');
  });
});

describe('init', () => {
  beforeEach(() => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<test-model>');
    vi.stubEnv(OPENAI_API_KEY, '<test-openai-api-key>');
    vi.stubEnv(OPENAI_BASE_URL, '<test-openai-base-url>');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
  // skip check temporarily because of globalConfigManager will be refactored to support multiple agents
  it.skip('init can not be called twice', () => {
    const globalConfigManager = new GlobalConfigManager();

    globalConfigManager.init();
    expect(() => globalConfigManager.init()).toThrowErrorMatchingInlineSnapshot(
      '[Error: GlobalConfigManager.init should be called only once]',
    );
  });

  it('multiple init', () => {
    const globalConfigManager = new GlobalConfigManager();

    globalConfigManager.init();
    expect(
      globalConfigManager.getModelConfigByIntent('default').modelName,
    ).toBe('<test-model>');

    globalConfigManager.registerOverride(
      {
        [MIDSCENE_MODEL_NAME]: 'override-model-name',
      },
      true,
    );

    expect(
      globalConfigManager.getModelConfigByIntent('default').modelName,
    ).toBe('override-model-name');

    globalConfigManager.init(() => {
      return {
        [MIDSCENE_MODEL_NAME]: 'override-model-name-2',
        [MIDSCENE_OPENAI_API_KEY]: 'override-openai-api-key-2',
        [MIDSCENE_OPENAI_BASE_URL]: 'override-openai-base-url-2',
      };
    });

    expect(
      globalConfigManager.getModelConfigByIntent('default').modelName,
    ).toBe('override-model-name-2');

    globalConfigManager.registerOverride(
      {
        [MIDSCENE_MODEL_NAME]: 'override-model-name-3',
      },
      true,
    );

    // modelConfigFn in init has higher priority than registerOverride
    expect(
      globalConfigManager.getModelConfigByIntent('default').modelName,
    ).toBe('override-model-name-2');
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

    globalConfigManager.init();

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

    globalConfigManager.registerOverride({
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

describe('getModelConfigByIntent', () => {
  it('should throw if not initialized', () => {
    const globalConfigManager = new GlobalConfigManager();

    expect(() =>
      globalConfigManager.getModelConfigByIntent('default'),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: globalConfigManager is not initialized when call getModelConfigByIntent with intent default]',
    );
  });
});
