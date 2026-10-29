import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { GlobalConfigManager } from '../../../src/env/global-config-manager';
import { ModelConfigManager } from '../../../src/env/model-config-manager';

const defaults = {
  MIDSCENE_MODEL_NAME: 'default-model',
  MIDSCENE_MODEL_BASE_URL: 'https://default.example/v1',
  MIDSCENE_MODEL_API_KEY: 'default-key',
  MIDSCENE_MODEL_FAMILY: 'gpt-5',
  MIDSCENE_MODEL_TIMEOUT: '1000',
};
const locate = {
  MIDSCENE_LOCATE_MODEL_NAME: 'locate-model',
  MIDSCENE_LOCATE_MODEL_BASE_URL: 'https://locate.example/v1',
  MIDSCENE_LOCATE_MODEL_API_KEY: 'locate-key',
  MIDSCENE_LOCATE_MODEL_FAMILY: 'qwen3-vl',
};

afterEach(() => {
  rs.unstubAllEnvs();
});

describe('Locate model configuration', () => {
  it.each(['MiniMax-M3', 'MiniMax-M3.1-Flash-Preview'])(
    'accepts %s as a Locate model',
    (modelName) => {
      const manager = new ModelConfigManager({
        ...defaults,
        ...locate,
        MIDSCENE_LOCATE_MODEL_FAMILY: 'minimax',
        MIDSCENE_LOCATE_MODEL_NAME: modelName,
      });
      expect(manager.getModelConfig('locate')).toMatchObject({
        modelFamily: 'minimax',
        modelName,
        slot: 'locate',
      });
    },
  );

  it('accepts Ant Ling as a dedicated Locate model', () => {
    const manager = new ModelConfigManager({
      ...defaults,
      ...locate,
      MIDSCENE_LOCATE_MODEL_FAMILY: 'ant-ling',
      MIDSCENE_LOCATE_MODEL_NAME: 'Ling-3.0-flash-VL',
    });
    expect(manager.getModelConfig('locate')).toMatchObject({
      modelFamily: 'ant-ling',
      modelName: 'Ling-3.0-flash-VL',
      slot: 'locate',
    });
  });

  it('inherits the whole default configuration only when no Locate model is selected', () => {
    const manager = new ModelConfigManager(defaults);
    expect(manager.getModelConfig('locate')).toEqual({
      ...manager.getModelConfig('default'),
      intent: 'locate',
    });
  });

  it('keeps all four roles and connection options isolated', () => {
    const manager = new ModelConfigManager({
      ...defaults,
      ...locate,
      MIDSCENE_PLANNING_MODEL_NAME: 'planner',
      MIDSCENE_PLANNING_MODEL_BASE_URL: 'https://plan.example/v1',
      MIDSCENE_INSIGHT_MODEL_NAME: 'insight',
      MIDSCENE_INSIGHT_MODEL_BASE_URL: 'https://insight.example/v1',
      MIDSCENE_LOCATE_MODEL_PROTOCOL: 'openai-responses',
      MIDSCENE_LOCATE_MODEL_TIMEOUT: '2000',
      MIDSCENE_LOCATE_MODEL_TEMPERATURE: '0.1',
      MIDSCENE_LOCATE_MODEL_RETRY_COUNT: '0',
      MIDSCENE_LOCATE_MODEL_RETRY_INTERVAL: '100',
      MIDSCENE_LOCATE_MODEL_REASONING_ENABLED: 'false',
      MIDSCENE_LOCATE_MODEL_REASONING_EFFORT: 'low',
      MIDSCENE_LOCATE_MODEL_REASONING_BUDGET: '128',
      MIDSCENE_LOCATE_MODEL_RESPONSE_FORMAT: 'none',
      MIDSCENE_LOCATE_MODEL_HTTP_PROXY: 'http://localhost:8080',
      MIDSCENE_LOCATE_MODEL_SOCKS_PROXY: 'socks5://localhost:1080',
      MIDSCENE_LOCATE_MODEL_EXTRA_BODY_JSON: '{"custom":true}',
      MIDSCENE_LOCATE_MODEL_INIT_CONFIG_JSON:
        '{"defaultHeaders":{"x-test":"locate"}}',
    });
    expect(manager.getModelConfig('locate')).toMatchObject({
      modelName: 'locate-model',
      modelFamily: 'qwen3-vl',
      intent: 'locate',
      slot: 'locate',
      openaiBaseURL: 'https://locate.example/v1',
      openaiApiKey: 'locate-key',
      protocol: 'openai-responses',
      timeout: 2000,
      temperature: 0.1,
      retryCount: 0,
      retryInterval: 100,
      reasoningEnabled: false,
      reasoningEffort: 'low',
      reasoningBudget: 128,
      responseFormat: 'none',
      httpProxy: 'http://localhost:8080',
      socksProxy: 'socks5://localhost:1080',
      extraBody: { custom: true },
      openaiExtraConfig: { defaultHeaders: { 'x-test': 'locate' } },
    });
    expect(manager.getModelConfig('default').modelName).toBe('default-model');
    expect(manager.getModelConfig('planning').modelName).toBe('planner');
    expect(manager.getModelConfig('insight').modelName).toBe('insight');
  });

  it('never borrows default credentials or timeout for a separately configured Locate model', () => {
    const manager = new ModelConfigManager({
      ...defaults,
      ...locate,
      MIDSCENE_LOCATE_MODEL_API_KEY: '',
    });
    expect(manager.getModelConfig('locate').openaiApiKey).toBeUndefined();
    expect(manager.getModelConfig('locate').timeout).toBeUndefined();
    expect(() =>
      new ModelConfigManager({
        ...defaults,
        MIDSCENE_LOCATE_MODEL_NAME: 'incomplete',
      }).getModelConfig('locate'),
    ).toThrow('intent=locate');
  });

  it('supports environment overrides and removing the Locate model', () => {
    for (const [key, value] of Object.entries({ ...defaults, ...locate })) {
      rs.stubEnv(key, value);
    }
    const manager = new ModelConfigManager();
    const global = new GlobalConfigManager();
    manager.registerGlobalConfigManager(global);
    expect(manager.getModelConfig('locate').slot).toBe('locate');
    rs.stubEnv('MIDSCENE_LOCATE_MODEL_NAME', '');
    manager.clearModelConfigMap();
    expect(manager.getModelConfig('locate').modelName).toBe('default-model');
  });

  it('validates the effective Locate model for devices requiring localization', () => {
    const manager = new ModelConfigManager({
      ...defaults,
      MIDSCENE_MODEL_FAMILY: '',
      ...locate,
    });
    expect(() => manager.throwErrorIfNonVLModel()).not.toThrow();
    expect(() =>
      new ModelConfigManager({
        ...defaults,
        ...locate,
        MIDSCENE_LOCATE_MODEL_FAMILY: '',
      }).throwErrorIfNonVLModel(),
    ).toThrow('MIDSCENE_LOCATE_MODEL_FAMILY');
  });
});
