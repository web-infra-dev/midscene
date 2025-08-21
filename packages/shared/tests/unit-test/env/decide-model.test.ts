import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIDSCENE_MODEL_NAME,
  MIDSCENE_PLANNING_MODEL_NAME,
  MIDSCENE_PLANNING_OPENAI_API_KEY,
  MIDSCENE_PLANNING_OPENAI_BASE_URL,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  decideModelConfig,
  globalConfigManger,
} from '../../../src/env';

describe('decideModelConfig from modelConfig fn', () => {
  beforeEach(() => {
    globalConfigManger.reset();
  });

  afterEach(() => {
    globalConfigManger.reset();
  });
  it('return undefined config', () => {
    expect(() =>
      globalConfigManger.registerModelConfigFn(({ intent }) => {
        return undefined as any;
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The agent has an option named modelConfig is a function, but it return undefined when call with intent VQA, which should be a object.]',
    );
  });

  it('return lacking config for VQA', () => {
    globalConfigManger.registerModelConfigFn(({ intent }) => {
      if (intent === 'VQA') {
        return {} as any;
      }
      return {
        MIDSCENE_MODEL_NAME: 'not-to-matter',
      };
    });
    expect(() =>
      decideModelConfig({ intent: 'VQA' }, true),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The return value of agent.modelConfig do not have a valid value with key MIDSCENE_MODEL_NAME.]',
    );
  });

  it('return full config for VQA', () => {
    globalConfigManger.registerModelConfigFn(({ intent }) => {
      if (intent === 'VQA') {
        return {
          MIDSCENE_VQA_MODEL_NAME: 'vqa-model',
          MIDSCENE_VQA_OPENAI_BASE_URL: 'mock-url',
          MIDSCENE_VQA_OPENAI_API_KEY: 'mock-key',
        };
      }
      return {
        MIDSCENE_MODEL_NAME: 'not-to-matter',
      };
    });

    const result = decideModelConfig({ intent: 'VQA' }, true);
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "modelConfig",
        "httpProxy": undefined,
        "modelDescription": "",
        "modelName": "vqa-model",
        "openaiApiKey": "mock-key",
        "openaiBaseURL": "mock-url",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsVersion": undefined,
        "vlMode": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });

  it('return default config', () => {
    globalConfigManger.registerModelConfigFn(() => {
      return {
        MIDSCENE_MODEL_NAME: 'default-model',
        MIDSCENE_OPENAI_BASE_URL: 'mock-url',
        MIDSCENE_OPENAI_API_KEY: 'mock-key',
      };
    });

    const result = decideModelConfig({ intent: 'VQA' }, true);
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "modelConfig",
        "httpProxy": undefined,
        "modelDescription": "",
        "modelName": "default-model",
        "openaiApiKey": "mock-key",
        "openaiBaseURL": "mock-url",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsVersion": undefined,
        "vlMode": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });
});

describe('decideModelConfig from env', () => {
  beforeEach(() => {
    globalConfigManger.reset();
    vi.stubEnv(OPENAI_API_KEY, 'keyInEnv');
    vi.stubEnv(OPENAI_BASE_URL, 'urlInInEnv');
    vi.stubEnv(MIDSCENE_MODEL_NAME, 'modelInEnv');
  });

  afterEach(() => {
    globalConfigManger.reset();
    vi.unstubAllEnvs();
  });

  it('declare lacking planning env', () => {
    vi.stubEnv(MIDSCENE_PLANNING_MODEL_NAME, 'planning-model');
    expect(() =>
      decideModelConfig({ intent: 'planning' }, true),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The MIDSCENE_PLANNING_OPENAI_BASE_URL must be a non-empty string because of the MIDSCENE_PLANNING_MODEL_NAME is declared as planning-model in process.env, but got: undefined. Please check your config.]',
    );
  });

  it('declare full planning env', () => {
    vi.stubEnv(MIDSCENE_PLANNING_MODEL_NAME, 'planning-model');
    vi.stubEnv(MIDSCENE_PLANNING_OPENAI_API_KEY, 'planning-key');
    vi.stubEnv(MIDSCENE_PLANNING_OPENAI_BASE_URL, 'planning-url');
    const result = decideModelConfig({ intent: 'planning' }, true);
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "env",
        "httpProxy": undefined,
        "modelDescription": "",
        "modelName": "planning-model",
        "openaiApiKey": "planning-key",
        "openaiBaseURL": "planning-url",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsVersion": undefined,
        "vlMode": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });

  it('declare no planning env and process.env has no config', () => {
    vi.unstubAllEnvs();
    // There are process.env.OPENAI_BASE_URL in the CI environment, which will cause case fail
    vi.stubEnv(OPENAI_BASE_URL, undefined);
    expect(() =>
      decideModelConfig({ intent: 'planning' }, true),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The OPENAI_BASE_URL must be a non-empty string, but got: undefined. Please check your config.]',
    );
  });

  it('declare no planning env and process.env has config', () => {
    const result = decideModelConfig({ intent: 'planning' }, true);
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "legacy-env",
        "httpProxy": undefined,
        "modelDescription": "",
        "modelName": "modelInEnv",
        "openaiApiKey": "keyInEnv",
        "openaiBaseURL": "urlInInEnv",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsVersion": undefined,
        "vlMode": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });

  it('default model is gpt-4o', () => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '');
    const result = decideModelConfig({ intent: 'planning' }, true);
    expect(result).toMatchInlineSnapshot(`
      {
        "from": "legacy-env",
        "httpProxy": undefined,
        "modelDescription": "",
        "modelName": "gpt-4o",
        "openaiApiKey": "keyInEnv",
        "openaiBaseURL": "urlInInEnv",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "uiTarsVersion": undefined,
        "vlMode": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });
});
