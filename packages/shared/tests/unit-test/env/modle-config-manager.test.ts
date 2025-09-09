import { GlobalConfigManager } from 'src/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelConfigManager } from '../../../src/env/model-config-manager';
import type { TIntent, TModelConfigFn } from '../../../src/env/types';
import {
  MIDSCENE_GROUNDING_MODEL_NAME,
  MIDSCENE_GROUNDING_OPENAI_API_KEY,
  MIDSCENE_GROUNDING_OPENAI_BASE_URL,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_OPENAI_API_KEY,
  MIDSCENE_OPENAI_BASE_URL,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_PLANNING_MODEL_NAME,
  MIDSCENE_PLANNING_OPENAI_API_KEY,
  MIDSCENE_PLANNING_OPENAI_BASE_URL,
  MIDSCENE_VQA_MODEL_NAME,
  MIDSCENE_VQA_OPENAI_API_KEY,
  MIDSCENE_VQA_OPENAI_BASE_URL,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
} from '../../../src/env/types';

describe('ModelConfigManager', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('constructor', () => {
    it('should create instance in normal mode when no modelConfigFn provided', () => {
      const manager = new ModelConfigManager();
      expect(manager).toBeInstanceOf(ModelConfigManager);
    });

    it('should create instance in isolated mode when modelConfigFn provided', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => {
        const baseConfig = {
          [MIDSCENE_MODEL_NAME]: 'gpt-4',
          [MIDSCENE_OPENAI_API_KEY]: 'test-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        };

        switch (intent) {
          case 'VQA':
            return {
              [MIDSCENE_VQA_MODEL_NAME]: 'gpt-4-vision',
              [MIDSCENE_VQA_OPENAI_API_KEY]: 'test-vqa-key',
              [MIDSCENE_VQA_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
            };
          case 'planning':
            return {
              [MIDSCENE_PLANNING_MODEL_NAME]: 'gpt-4',
              [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-planning-key',
              [MIDSCENE_PLANNING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
            };
          case 'grounding':
            return {
              [MIDSCENE_GROUNDING_MODEL_NAME]: 'gpt-4-vision',
              [MIDSCENE_GROUNDING_OPENAI_API_KEY]: 'test-grounding-key',
              [MIDSCENE_GROUNDING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
            };
          case 'default':
            return baseConfig;
          default:
            return baseConfig;
        }
      };

      const manager = new ModelConfigManager(modelConfigFn);
      expect(manager).toBeInstanceOf(ModelConfigManager);
    });

    it('should throw error when modelConfigFn returns undefined for any intent', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => {
        if (intent === 'VQA') {
          return undefined as any;
        }
        return {
          [MIDSCENE_MODEL_NAME]: 'gpt-4',
          [MIDSCENE_OPENAI_API_KEY]: 'test-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        };
      };

      expect(() => new ModelConfigManager(modelConfigFn)).toThrow(
        'The agent has an option named modelConfig is a function, but it return undefined when call with intent VQA, which should be a object.',
      );
    });
  });

  describe('getModelConfig', () => {
    it('should return model config in isolated mode', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => {
        const baseConfig = {
          [MIDSCENE_MODEL_NAME]: 'gpt-4',
          [MIDSCENE_OPENAI_API_KEY]: 'test-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        };

        switch (intent) {
          case 'VQA':
            return {
              [MIDSCENE_VQA_MODEL_NAME]: 'gpt-4-vision',
              [MIDSCENE_VQA_OPENAI_API_KEY]: 'test-vqa-key',
              [MIDSCENE_VQA_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
            };
          case 'planning':
            return {
              [MIDSCENE_PLANNING_MODEL_NAME]: 'gpt-4',
              [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-planning-key',
              [MIDSCENE_PLANNING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
            };
          case 'grounding':
            return {
              [MIDSCENE_GROUNDING_MODEL_NAME]: 'gpt-4-vision',
              [MIDSCENE_GROUNDING_OPENAI_API_KEY]: 'test-grounding-key',
              [MIDSCENE_GROUNDING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
            };
          case 'default':
            return baseConfig;
          default:
            return baseConfig;
        }
      };

      const manager = new ModelConfigManager(modelConfigFn);

      const vqaConfig = manager.getModelConfig('VQA');
      expect(vqaConfig.modelName).toBe('gpt-4-vision');
      expect(vqaConfig.openaiApiKey).toBe('test-vqa-key');
      expect(vqaConfig.intent).toBe('VQA');
      expect(vqaConfig.from).toBe('modelConfig');

      const planningConfig = manager.getModelConfig('planning');
      expect(planningConfig.modelName).toBe('gpt-4');
      expect(planningConfig.openaiApiKey).toBe('test-planning-key');
      expect(planningConfig.intent).toBe('planning');
      expect(planningConfig.from).toBe('modelConfig');

      const groundingConfig = manager.getModelConfig('grounding');
      expect(groundingConfig.modelName).toBe('gpt-4-vision');
      expect(groundingConfig.openaiApiKey).toBe('test-grounding-key');
      expect(groundingConfig.intent).toBe('grounding');
      expect(groundingConfig.from).toBe('modelConfig');

      const defaultConfig = manager.getModelConfig('default');
      expect(defaultConfig.modelName).toBe('gpt-4');
      expect(defaultConfig.openaiApiKey).toBe('test-key');
      expect(defaultConfig.intent).toBe('default');
      expect(defaultConfig.from).toBe('modelConfig');
    });

    it('should return model config in normal mode', () => {
      vi.stubEnv(MIDSCENE_MODEL_NAME, 'gpt-4');
      vi.stubEnv(OPENAI_API_KEY, 'test-key');
      vi.stubEnv(OPENAI_BASE_URL, 'https://api.openai.com/v1');

      const manager = new ModelConfigManager();
      manager.registerGlobalConfigManager(new GlobalConfigManager());

      const config = manager.getModelConfig('default');
      expect(config.modelName).toBe('gpt-4');
      expect(config.openaiApiKey).toBe('test-key');
      expect(config.openaiBaseURL).toBe('https://api.openai.com/v1');
      expect(config.intent).toBe('default');
      expect(config.from).toBe('legacy-env');
    });
  });

  describe('clearModelConfigMap', () => {
    it('should clear modelConfigMap in normal mode', () => {
      vi.stubEnv(MIDSCENE_MODEL_NAME, 'gpt-4');
      vi.stubEnv(OPENAI_API_KEY, 'test-key');
      vi.stubEnv(OPENAI_BASE_URL, 'https://api.openai.com/v1');

      const manager = new ModelConfigManager();
      manager.registerGlobalConfigManager(new GlobalConfigManager());

      // Initialize modelConfigMap by calling getModelConfig
      manager.getModelConfig('default');

      // Clear it
      manager.clearModelConfigMap();

      // Should not throw when calling getModelConfig again
      expect(() => manager.getModelConfig('default')).not.toThrow();
    });

    it('should throw error when called in isolated mode', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => ({
        [MIDSCENE_MODEL_NAME]: 'gpt-4',
        [MIDSCENE_OPENAI_API_KEY]: 'test-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
      });

      const manager = new ModelConfigManager(modelConfigFn);

      expect(() => manager.clearModelConfigMap()).toThrow(
        'ModelConfigManager work in isolated mode, so clearModelConfigMap should not be called',
      );
    });
  });

  describe('getUploadTestServerUrl', () => {
    it('should return upload test server URL from default config', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => ({
        [MIDSCENE_MODEL_NAME]: 'gpt-4',
        [MIDSCENE_OPENAI_API_KEY]: 'test-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        [MIDSCENE_OPENAI_INIT_CONFIG_JSON]: JSON.stringify({
          REPORT_SERVER_URL: 'https://test-server.com',
        }),
      });

      const manager = new ModelConfigManager(modelConfigFn);
      const serverUrl = manager.getUploadTestServerUrl();
      expect(serverUrl).toBe('https://test-server.com');
    });

    it('should return undefined when no REPORT_SERVER_URL in config', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => ({
        [MIDSCENE_MODEL_NAME]: 'gpt-4',
        [MIDSCENE_OPENAI_API_KEY]: 'test-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
      });

      const manager = new ModelConfigManager(modelConfigFn);
      const serverUrl = manager.getUploadTestServerUrl();
      expect(serverUrl).toBeUndefined();
    });

    it('should return undefined when openaiExtraConfig is undefined', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => ({
        [MIDSCENE_MODEL_NAME]: 'gpt-4',
        [MIDSCENE_OPENAI_API_KEY]: 'test-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
      });

      const manager = new ModelConfigManager(modelConfigFn);
      const serverUrl = manager.getUploadTestServerUrl();
      expect(serverUrl).toBeUndefined();
    });
  });

  describe('isolated mode behavior', () => {
    it('should not be affected by environment variables in isolated mode', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => ({
        [MIDSCENE_MODEL_NAME]: 'gpt-4',
        [MIDSCENE_OPENAI_API_KEY]: 'isolated-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'https://isolated.openai.com/v1',
      });

      // Set environment variables that should be ignored
      vi.stubEnv(MIDSCENE_MODEL_NAME, 'gpt-3.5-turbo');
      vi.stubEnv(MIDSCENE_OPENAI_API_KEY, 'env-key');
      vi.stubEnv(MIDSCENE_OPENAI_BASE_URL, 'https://env.openai.com/v1');

      const manager = new ModelConfigManager(modelConfigFn);
      const config = manager.getModelConfig('default');

      // Should use values from modelConfigFn, not environment
      expect(config.modelName).toBe('gpt-4');
      expect(config.openaiApiKey).toBe('isolated-key');
      expect(config.openaiBaseURL).toBe('https://isolated.openai.com/v1');
    });
  });
});
