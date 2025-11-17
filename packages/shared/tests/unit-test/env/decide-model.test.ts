import { describe, expect, it } from 'vitest';
import {
  decideModelConfigFromEnv,
  decideModelConfigFromIntentConfig,
} from '../../../src/env/decide-model-config';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MODEL_API_KEY,
  MODEL_BASE_URL,
} from '../../../src/env/types';

describe('decideModelConfig from modelConfig fn', () => {
  it('return lacking config for insight', () => {
    expect(() =>
      decideModelConfigFromIntentConfig('insight', {}),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The return value of agent.modelConfig do not have a valid value with key MIDSCENE_MODEL_NAME.]',
    );
  });

  it('return full config for insight', () => {
    const result = decideModelConfigFromIntentConfig('insight', {
      MIDSCENE_INSIGHT_MODEL_NAME: 'insight-model',
      MIDSCENE_INSIGHT_MODEL_BASE_URL: 'mock-url',
      MIDSCENE_INSIGHT_MODEL_API_KEY: 'mock-key',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "modelConfig",
        "httpProxy": undefined,
        "intent": "insight",
        "modelDescription": "",
        "modelName": "insight-model",
        "openaiApiKey": "mock-key",
        "openaiBaseURL": "mock-url",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsModelVersion": undefined,
        "vlMode": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });

  it('return default config', () => {
    const result = decideModelConfigFromIntentConfig('insight', {
      MIDSCENE_MODEL_NAME: 'default-model',
      MIDSCENE_MODEL_BASE_URL: 'mock-url',
      MIDSCENE_MODEL_API_KEY: 'mock-key',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "modelConfig",
        "httpProxy": undefined,
        "intent": "insight",
        "modelDescription": "",
        "modelName": "default-model",
        "openaiApiKey": "mock-key",
        "openaiBaseURL": "mock-url",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsModelVersion": undefined,
        "vlMode": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });
});

describe('decideModelConfig from env', () => {
  const stubEnvConfig = {
    OPENAI_API_KEY: 'keyInEnv',
    OPENAI_BASE_URL: 'urlInInEnv',
    MIDSCENE_MODEL_NAME: 'modelInEnv',
  };

  describe('backward compatibility for legacy variables', () => {
    it('should use OPENAI_API_KEY when MIDSCENE_MODEL_API_KEY is not set', () => {
      const result = decideModelConfigFromEnv('default', {
        MIDSCENE_MODEL_NAME: 'test-model',
        OPENAI_API_KEY: 'legacy-key',
        OPENAI_BASE_URL: 'legacy-url',
      });
      expect(result.openaiApiKey).toBe('legacy-key');
      expect(result.openaiBaseURL).toBe('legacy-url');
      expect(result.from).toBe('legacy-env');
    });

    it('should use MIDSCENE_MODEL_API_KEY when both MIDSCENE_MODEL_API_KEY and OPENAI_API_KEY are set', () => {
      const result = decideModelConfigFromEnv('default', {
        MIDSCENE_MODEL_NAME: 'test-model',
        [MIDSCENE_MODEL_API_KEY]: 'new-key',
        [MIDSCENE_MODEL_BASE_URL]: 'new-url',
        OPENAI_API_KEY: 'legacy-key',
        OPENAI_BASE_URL: 'legacy-url',
      });
      expect(result.openaiApiKey).toBe('new-key');
      expect(result.openaiBaseURL).toBe('new-url');
      expect(result.from).toBe('legacy-env');
    });

    it('should use MIDSCENE_MODEL_API_KEY when only new variables are set', () => {
      const result = decideModelConfigFromEnv('default', {
        MIDSCENE_MODEL_NAME: 'test-model',
        [MIDSCENE_MODEL_API_KEY]: 'new-key',
        [MIDSCENE_MODEL_BASE_URL]: 'new-url',
      });
      expect(result.openaiApiKey).toBe('new-key');
      expect(result.openaiBaseURL).toBe('new-url');
      expect(result.from).toBe('legacy-env');
    });

    it('should prefer MIDSCENE_MODEL_BASE_URL over OPENAI_BASE_URL', () => {
      const result = decideModelConfigFromEnv('default', {
        MIDSCENE_MODEL_NAME: 'test-model',
        OPENAI_API_KEY: 'legacy-key',
        [MIDSCENE_MODEL_BASE_URL]: 'new-url',
        OPENAI_BASE_URL: 'legacy-url',
      });
      expect(result.openaiApiKey).toBe('legacy-key');
      expect(result.openaiBaseURL).toBe('new-url');
    });

    it('should prefer MIDSCENE_MODEL_API_KEY over OPENAI_API_KEY', () => {
      const result = decideModelConfigFromEnv('default', {
        MIDSCENE_MODEL_NAME: 'test-model',
        [MIDSCENE_MODEL_API_KEY]: 'new-key',
        OPENAI_API_KEY: 'legacy-key',
        OPENAI_BASE_URL: 'legacy-url',
      });
      expect(result.openaiApiKey).toBe('new-key');
      expect(result.openaiBaseURL).toBe('legacy-url');
    });

    it('should use deprecated MODEL_API_KEY when only deprecated variables are set', () => {
      const result = decideModelConfigFromEnv('default', {
        MIDSCENE_MODEL_NAME: 'test-model',
        [MODEL_API_KEY]: 'deprecated-key',
        [MODEL_BASE_URL]: 'deprecated-url',
      });
      expect(result.openaiApiKey).toBe('deprecated-key');
      expect(result.openaiBaseURL).toBe('deprecated-url');
      expect(result.from).toBe('legacy-env');
    });
  });

  it('declare lacking planning env', () => {
    expect(() =>
      decideModelConfigFromEnv('planning', {
        ...stubEnvConfig,
        MIDSCENE_PLANNING_MODEL_NAME: 'planning-model',
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The MIDSCENE_PLANNING_MODEL_API_KEY must be a non-empty string because of the MIDSCENE_PLANNING_MODEL_NAME is declared as planning-model in process.env, but got: undefined. Please check your config.]',
    );
  });

  it('declare full planning env', () => {
    const result = decideModelConfigFromEnv('planning', {
      ...stubEnvConfig,
      MIDSCENE_PLANNING_MODEL_NAME: 'planning-model',
      MIDSCENE_PLANNING_MODEL_API_KEY: 'planning-key',
      MIDSCENE_PLANNING_MODEL_BASE_URL: 'planning-url',
      [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "env",
        "httpProxy": undefined,
        "intent": "planning",
        "modelDescription": "qwen3-vl mode",
        "modelName": "planning-model",
        "openaiApiKey": "planning-key",
        "openaiBaseURL": "planning-url",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsModelVersion": undefined,
        "vlMode": "qwen3-vl",
        "vlModeRaw": undefined,
      }
    `);
  });

  it('declare no planning env and process.env has no config', () => {
    expect(() =>
      decideModelConfigFromEnv('planning', {}),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The OPENAI_API_KEY must be a non-empty string, but got: undefined. Please check your config.]',
    );
  });

  it('declare no planning env and process.env has config', () => {
    const result = decideModelConfigFromEnv('planning', {
      ...stubEnvConfig,
      [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "legacy-env",
        "httpProxy": undefined,
        "intent": "planning",
        "modelDescription": "qwen3-vl mode",
        "modelName": "modelInEnv",
        "openaiApiKey": "keyInEnv",
        "openaiBaseURL": "urlInInEnv",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsModelVersion": undefined,
        "vlMode": "qwen3-vl",
        "vlModeRaw": undefined,
      }
    `);
  });

  it('default model is gpt-4o', () => {
    const result = decideModelConfigFromEnv('planning', {
      ...stubEnvConfig,
      MIDSCENE_MODEL_NAME: '',
      [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "legacy-env",
        "httpProxy": undefined,
        "intent": "planning",
        "modelDescription": "qwen3-vl mode",
        "modelName": "gpt-4o",
        "openaiApiKey": "keyInEnv",
        "openaiBaseURL": "urlInInEnv",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsModelVersion": undefined,
        "vlMode": "qwen3-vl",
        "vlModeRaw": undefined,
      }
    `);
  });
});
