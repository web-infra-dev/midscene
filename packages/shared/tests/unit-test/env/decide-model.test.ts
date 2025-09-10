import { describe, expect, it } from 'vitest';
import {
  decideModelConfigFromEnv,
  decideModelConfigFromIntentConfig,
} from '../../../src/env/decide-model-config';

describe('decideModelConfig from modelConfig fn', () => {
  it('return lacking config for VQA', () => {
    expect(() =>
      decideModelConfigFromIntentConfig('VQA', {}),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The return value of agent.modelConfig do not have a valid value with key MIDSCENE_MODEL_NAME.]',
    );
  });

  it('return full config for VQA', () => {
    const result = decideModelConfigFromIntentConfig('VQA', {
      MIDSCENE_VQA_MODEL_NAME: 'vqa-model',
      MIDSCENE_VQA_OPENAI_BASE_URL: 'mock-url',
      MIDSCENE_VQA_OPENAI_API_KEY: 'mock-key',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "modelConfig",
        "httpProxy": undefined,
        "intent": "VQA",
        "modelDescription": "",
        "modelName": "vqa-model",
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
    const result = decideModelConfigFromIntentConfig('VQA', {
      MIDSCENE_MODEL_NAME: 'default-model',
      MIDSCENE_OPENAI_BASE_URL: 'mock-url',
      MIDSCENE_OPENAI_API_KEY: 'mock-key',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "modelConfig",
        "httpProxy": undefined,
        "intent": "VQA",
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

  it('declare lacking planning env', () => {
    expect(() =>
      decideModelConfigFromEnv('planning', {
        ...stubEnvConfig,
        MIDSCENE_PLANNING_MODEL_NAME: 'planning-model',
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The MIDSCENE_PLANNING_OPENAI_API_KEY must be a non-empty string because of the MIDSCENE_PLANNING_MODEL_NAME is declared as planning-model in process.env, but got: undefined. Please check your config.]',
    );
  });

  it('declare full planning env', () => {
    const result = decideModelConfigFromEnv('planning', {
      ...stubEnvConfig,
      MIDSCENE_PLANNING_MODEL_NAME: 'planning-model',
      MIDSCENE_PLANNING_OPENAI_API_KEY: 'planning-key',
      MIDSCENE_PLANNING_OPENAI_BASE_URL: 'planning-url',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "env",
        "httpProxy": undefined,
        "intent": "planning",
        "modelDescription": "",
        "modelName": "planning-model",
        "openaiApiKey": "planning-key",
        "openaiBaseURL": "planning-url",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsModelVersion": undefined,
        "vlMode": undefined,
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
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "legacy-env",
        "httpProxy": undefined,
        "intent": "planning",
        "modelDescription": "",
        "modelName": "modelInEnv",
        "openaiApiKey": "keyInEnv",
        "openaiBaseURL": "urlInInEnv",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsModelVersion": undefined,
        "vlMode": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });

  it('default model is gpt-4o', () => {
    const result = decideModelConfigFromEnv('planning', {
      ...stubEnvConfig,
      MIDSCENE_MODEL_NAME: '',
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "legacy-env",
        "httpProxy": undefined,
        "intent": "planning",
        "modelDescription": "",
        "modelName": "gpt-4o",
        "openaiApiKey": "keyInEnv",
        "openaiBaseURL": "urlInInEnv",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsModelVersion": undefined,
        "vlMode": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });
});
