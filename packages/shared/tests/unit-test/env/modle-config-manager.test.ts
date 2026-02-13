import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalConfigManager } from '../../../src/env/global-config-manager';
import { ModelConfigManager } from '../../../src/env/model-config-manager';
import {
  MIDSCENE_INSIGHT_MODEL_API_KEY,
  MIDSCENE_INSIGHT_MODEL_BASE_URL,
  MIDSCENE_INSIGHT_MODEL_NAME,
  MIDSCENE_INSIGHT_MODEL_TIMEOUT,
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_INIT_CONFIG_JSON,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_MODEL_REASONING_EFFORT,
  MIDSCENE_MODEL_TIMEOUT,
  MIDSCENE_PLANNING_MODEL_API_KEY,
  MIDSCENE_PLANNING_MODEL_BASE_URL,
  MIDSCENE_PLANNING_MODEL_NAME,
  MIDSCENE_PLANNING_MODEL_TIMEOUT,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '../../../src/env/types';

describe('ModelConfigManager', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const baseMap = {
    [MIDSCENE_MODEL_NAME]: 'gpt-4',
    [MIDSCENE_MODEL_API_KEY]: 'test-key',
    [MIDSCENE_MODEL_BASE_URL]: 'https://api.openai.com/v1',
    [MIDSCENE_INSIGHT_MODEL_NAME]: 'gpt-4-vision',
    [MIDSCENE_INSIGHT_MODEL_API_KEY]: 'insight-key',
    [MIDSCENE_INSIGHT_MODEL_BASE_URL]: 'https://insight.openai.com/v1',
    [MIDSCENE_PLANNING_MODEL_NAME]: 'qwen-vl-plus',
    [MIDSCENE_PLANNING_MODEL_API_KEY]: 'plan-key',
    [MIDSCENE_PLANNING_MODEL_BASE_URL]: 'https://plan.openai.com/v1',
    [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
  };

  it('initializes from provided config map (isolated mode)', () => {
    const manager = new ModelConfigManager(baseMap);

    const defaultConfig = manager.getModelConfig('default');
    const insightConfig = manager.getModelConfig('insight');
    const planningConfig = manager.getModelConfig('planning');

    expect(defaultConfig.modelName).toBe('gpt-4');
    expect(insightConfig.modelName).toBe('gpt-4-vision');
    expect(planningConfig.modelName).toBe('qwen-vl-plus');
  });

  it('prefer MIDSCENE_MODEL', () => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, 'env-model');
    vi.stubEnv(MIDSCENE_MODEL_API_KEY, 'env-key');
    vi.stubEnv(MIDSCENE_MODEL_BASE_URL, 'https://env.example.com');
    vi.stubEnv(OPENAI_API_KEY, 'openai-api-env-key');
    vi.stubEnv(OPENAI_BASE_URL, 'openai-base-url');
    vi.stubEnv(MIDSCENE_MODEL_FAMILY, 'qwen3-vl');

    const manager = new ModelConfigManager();
    manager.registerGlobalConfigManager(new GlobalConfigManager());

    const config = manager.getModelConfig('default');
    expect(config.modelName).toBe('env-model');
    expect(config.openaiApiKey).toBe('env-key');
    expect(config.openaiBaseURL).toBe('https://env.example.com');
    expect(config.intent).toBe('default');
  });

  it('reads from environment when no config function provided', () => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, 'env-model');
    vi.stubEnv(MIDSCENE_MODEL_API_KEY, 'env-key');
    vi.stubEnv(MIDSCENE_MODEL_BASE_URL, 'https://env.example.com');
    vi.stubEnv(MIDSCENE_MODEL_FAMILY, 'qwen3-vl');

    const manager = new ModelConfigManager();
    manager.registerGlobalConfigManager(new GlobalConfigManager());

    const config = manager.getModelConfig('default');
    expect(config.modelName).toBe('env-model');
    expect(config.openaiApiKey).toBe('env-key');
    expect(config.openaiBaseURL).toBe('https://env.example.com');
    expect(config.intent).toBe('default');
  });

  it('provides upload server URL from openaiExtraConfig', () => {
    const manager = new ModelConfigManager({
      ...baseMap,
      [MIDSCENE_MODEL_INIT_CONFIG_JSON]: JSON.stringify({
        REPORT_SERVER_URL: 'https://uploader.test',
      }),
    });

    expect(manager.getUploadTestServerUrl()).toBe('https://uploader.test');
  });

  it('clears model config map when called by global manager', () => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, 'env-model');
    vi.stubEnv(OPENAI_API_KEY, 'env-key');
    vi.stubEnv(OPENAI_BASE_URL, 'https://env.example.com');

    const manager = new ModelConfigManager();
    manager.registerGlobalConfigManager(new GlobalConfigManager());

    const first = manager.getModelConfig('default');
    manager.clearModelConfigMap();
    const second = manager.getModelConfig('default');

    expect(first).not.toBe(second);
    expect(second.modelName).toBe('env-model');
  });

  it('injects createOpenAIClient when provided', () => {
    const createClient = vi.fn();
    const manager = new ModelConfigManager(baseMap, createClient);

    const config = manager.getModelConfig('default');
    expect(config.createOpenAIClient).toBe(createClient);
  });

  it('parses reasoningEffort for doubao-vision', () => {
    const configWithReasoning = {
      ...baseMap,
      [MIDSCENE_MODEL_FAMILY]: 'doubao-vision',
      [MIDSCENE_MODEL_REASONING_EFFORT]: 'medium',
    };
    const manager = new ModelConfigManager(configWithReasoning);

    const config = manager.getModelConfig('default');
    expect(config.reasoningEffort).toBe('medium');
  });

  describe('per-intent timeout configuration', () => {
    it('uses per-intent timeout configs from modelConfig', () => {
      const configWithTimeout = {
        ...baseMap,
        [MIDSCENE_MODEL_TIMEOUT]: '45000',
        [MIDSCENE_INSIGHT_MODEL_TIMEOUT]: '60000',
        [MIDSCENE_PLANNING_MODEL_TIMEOUT]: '90000',
      };
      const manager = new ModelConfigManager(configWithTimeout);

      expect(manager.getModelConfig('default').timeout).toBe(45000);
      expect(manager.getModelConfig('insight').timeout).toBe(60000);
      expect(manager.getModelConfig('planning').timeout).toBe(90000);
    });

    it('reads per-intent timeout from environment variables', () => {
      vi.stubEnv(MIDSCENE_MODEL_NAME, 'env-model');
      vi.stubEnv(MIDSCENE_MODEL_API_KEY, 'env-key');
      vi.stubEnv(MIDSCENE_MODEL_BASE_URL, 'https://env.example.com');
      vi.stubEnv(MIDSCENE_MODEL_FAMILY, 'qwen3-vl');
      vi.stubEnv(MIDSCENE_MODEL_TIMEOUT, '120000');
      vi.stubEnv(MIDSCENE_INSIGHT_MODEL_NAME, 'insight-model');
      vi.stubEnv(
        MIDSCENE_INSIGHT_MODEL_BASE_URL,
        'https://insight.example.com',
      );
      vi.stubEnv(MIDSCENE_INSIGHT_MODEL_TIMEOUT, '180000');
      vi.stubEnv(MIDSCENE_PLANNING_MODEL_NAME, 'planning-model');
      vi.stubEnv(
        MIDSCENE_PLANNING_MODEL_BASE_URL,
        'https://planning.example.com',
      );
      vi.stubEnv(MIDSCENE_PLANNING_MODEL_TIMEOUT, '240000');

      const manager = new ModelConfigManager();
      manager.registerGlobalConfigManager(new GlobalConfigManager());

      expect(manager.getModelConfig('default').timeout).toBe(120000);
      expect(manager.getModelConfig('insight').timeout).toBe(180000);
      expect(manager.getModelConfig('planning').timeout).toBe(240000);
    });

    it('returns undefined timeout when not configured', () => {
      const manager = new ModelConfigManager(baseMap);

      expect(manager.getModelConfig('default').timeout).toBeUndefined();
    });

    it('insight and planning fall back to default timeout when not configured', () => {
      const configWithTimeout = {
        ...baseMap,
        [MIDSCENE_MODEL_TIMEOUT]: '45000',
      };
      const manager = new ModelConfigManager(configWithTimeout);

      expect(manager.getModelConfig('default').timeout).toBe(45000);
      // insight and planning fall back to default config which has the timeout
      expect(manager.getModelConfig('insight').timeout).toBeUndefined();
      expect(manager.getModelConfig('planning').timeout).toBeUndefined();
    });
  });
});
