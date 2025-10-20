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
  MIDSCENE_PLANNING_VL_MODE,
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
              [MIDSCENE_PLANNING_MODEL_NAME]: 'qwen-vl-plus',
              [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-planning-key',
              [MIDSCENE_PLANNING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
              [MIDSCENE_PLANNING_VL_MODE]: 'qwen-vl' as const,
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
              [MIDSCENE_PLANNING_MODEL_NAME]: 'qwen-vl-plus',
              [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-planning-key',
              [MIDSCENE_PLANNING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
              [MIDSCENE_PLANNING_VL_MODE]: 'qwen-vl',
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
      expect(planningConfig.modelName).toBe('qwen-vl-plus');
      expect(planningConfig.openaiApiKey).toBe('test-planning-key');
      expect(planningConfig.intent).toBe('planning');
      expect(planningConfig.from).toBe('modelConfig');
      expect(planningConfig.vlMode).toBe('qwen-vl');

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

  describe('Planning VL mode validation', () => {
    it('should throw error when planning has no vlMode in isolated mode', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => {
        if (intent === 'planning') {
          // Missing VL mode for planning
          return {
            [MIDSCENE_PLANNING_MODEL_NAME]: 'gpt-4',
            [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-key',
            [MIDSCENE_PLANNING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
          };
        }
        return {
          [MIDSCENE_MODEL_NAME]: 'gpt-4',
          [MIDSCENE_OPENAI_API_KEY]: 'test-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        };
      };

      const manager = new ModelConfigManager(modelConfigFn);

      expect(() => manager.getModelConfig('planning')).toThrow(
        'Planning requires a vision language model (VL model). DOM-based planning is not supported.',
      );
    });

    it('should succeed when planning has valid vlMode in isolated mode', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => {
        if (intent === 'planning') {
          return {
            [MIDSCENE_PLANNING_MODEL_NAME]: 'qwen-vl-plus',
            [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-key',
            [MIDSCENE_PLANNING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
            [MIDSCENE_PLANNING_VL_MODE]: 'qwen-vl' as const,
          };
        }
        return {
          [MIDSCENE_MODEL_NAME]: 'gpt-4',
          [MIDSCENE_OPENAI_API_KEY]: 'test-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        };
      };

      const manager = new ModelConfigManager(modelConfigFn);
      const config = manager.getModelConfig('planning');

      expect(config.vlMode).toBe('qwen-vl');
      expect(config.modelName).toBe('qwen-vl-plus');
    });

    it('should throw error when planning has no vlMode in normal mode', () => {
      vi.stubEnv(MIDSCENE_PLANNING_MODEL_NAME, 'gpt-4');
      vi.stubEnv(MIDSCENE_PLANNING_OPENAI_API_KEY, 'test-key');
      vi.stubEnv(
        MIDSCENE_PLANNING_OPENAI_BASE_URL,
        'https://api.openai.com/v1',
      );
      // Intentionally not setting MIDSCENE_PLANNING_VL_MODE

      const manager = new ModelConfigManager();
      manager.registerGlobalConfigManager(new GlobalConfigManager());

      expect(() => manager.getModelConfig('planning')).toThrow(
        'Planning requires a vision language model (VL model). DOM-based planning is not supported.',
      );
    });

    it('should succeed when planning has valid vlMode in normal mode', () => {
      vi.stubEnv(MIDSCENE_PLANNING_MODEL_NAME, 'qwen-vl-plus');
      vi.stubEnv(MIDSCENE_PLANNING_OPENAI_API_KEY, 'test-key');
      vi.stubEnv(
        MIDSCENE_PLANNING_OPENAI_BASE_URL,
        'https://api.openai.com/v1',
      );
      vi.stubEnv(MIDSCENE_PLANNING_VL_MODE, 'qwen-vl');

      const manager = new ModelConfigManager();
      manager.registerGlobalConfigManager(new GlobalConfigManager());

      const config = manager.getModelConfig('planning');

      expect(config.vlMode).toBe('qwen-vl');
      expect(config.modelName).toBe('qwen-vl-plus');
      expect(config.intent).toBe('planning');
    });

    it('should not affect other intents when planning validation fails', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => {
        if (intent === 'planning') {
          // Missing VL mode for planning - should fail
          return {
            [MIDSCENE_PLANNING_MODEL_NAME]: 'gpt-4',
            [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-key',
            [MIDSCENE_PLANNING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
          };
        }
        // Other intents should work fine
        return {
          [MIDSCENE_MODEL_NAME]: 'gpt-4',
          [MIDSCENE_OPENAI_API_KEY]: 'test-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        };
      };

      const manager = new ModelConfigManager(modelConfigFn);

      // Planning should fail
      expect(() => manager.getModelConfig('planning')).toThrow(
        'Planning requires a vision language model',
      );

      // Other intents should succeed
      expect(() => manager.getModelConfig('default')).not.toThrow();
      expect(() => manager.getModelConfig('VQA')).not.toThrow();
      expect(() => manager.getModelConfig('grounding')).not.toThrow();
    });

    it('should accept all valid VL modes for planning', () => {
      const vlModeTestCases: Array<{
        raw:
          | 'qwen-vl'
          | 'qwen3-vl'
          | 'gemini'
          | 'doubao-vision'
          | 'vlm-ui-tars'
          | 'vlm-ui-tars-doubao'
          | 'vlm-ui-tars-doubao-1.5';
        expected: string;
      }> = [
        { raw: 'qwen-vl', expected: 'qwen-vl' },
        { raw: 'qwen3-vl', expected: 'qwen3-vl' },
        { raw: 'gemini', expected: 'gemini' },
        { raw: 'doubao-vision', expected: 'doubao-vision' },
        // UI-TARS variants all normalize to 'vlm-ui-tars'
        { raw: 'vlm-ui-tars', expected: 'vlm-ui-tars' },
        { raw: 'vlm-ui-tars-doubao', expected: 'vlm-ui-tars' },
        { raw: 'vlm-ui-tars-doubao-1.5', expected: 'vlm-ui-tars' },
      ];

      for (const { raw, expected } of vlModeTestCases) {
        const modelConfigFn: TModelConfigFn = ({ intent }) => {
          if (intent === 'planning') {
            return {
              [MIDSCENE_PLANNING_MODEL_NAME]: 'test-model',
              [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-key',
              [MIDSCENE_PLANNING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
              [MIDSCENE_PLANNING_VL_MODE]: raw,
            };
          }
          return {
            [MIDSCENE_MODEL_NAME]: 'gpt-4',
            [MIDSCENE_OPENAI_API_KEY]: 'test-key',
            [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
          };
        };

        const manager = new ModelConfigManager(modelConfigFn);
        const config = manager.getModelConfig('planning');

        expect(config.vlMode).toBe(expected);
      }
    });
  });

  describe('createOpenAIClient factory function', () => {
    it('should inject createOpenAIClient into config when provided in isolated mode', () => {
      const mockCreateClient = vi.fn();
      const modelConfigFn: TModelConfigFn = ({ intent }) => ({
        [MIDSCENE_MODEL_NAME]: 'gpt-4',
        [MIDSCENE_OPENAI_API_KEY]: 'test-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
      });

      const manager = new ModelConfigManager(modelConfigFn, mockCreateClient);
      const config = manager.getModelConfig('default');

      expect(config.createOpenAIClient).toBe(mockCreateClient);
    });

    it('should inject createOpenAIClient into config when provided in normal mode', () => {
      vi.stubEnv(MIDSCENE_MODEL_NAME, 'gpt-4');
      vi.stubEnv(OPENAI_API_KEY, 'test-key');
      vi.stubEnv(OPENAI_BASE_URL, 'https://api.openai.com/v1');

      const mockCreateClient = vi.fn();
      const manager = new ModelConfigManager(undefined, mockCreateClient);
      manager.registerGlobalConfigManager(new GlobalConfigManager());

      const config = manager.getModelConfig('default');

      expect(config.createOpenAIClient).toBe(mockCreateClient);
    });

    it('should inject createOpenAIClient into all intent configs in isolated mode', () => {
      const mockCreateClient = vi.fn();
      const modelConfigFn: TModelConfigFn = ({ intent }) => {
        switch (intent) {
          case 'VQA':
            return {
              [MIDSCENE_VQA_MODEL_NAME]: 'gpt-4-vision',
              [MIDSCENE_VQA_OPENAI_API_KEY]: 'test-vqa-key',
              [MIDSCENE_VQA_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
            };
          case 'planning':
            return {
              [MIDSCENE_PLANNING_MODEL_NAME]: 'qwen-vl-plus',
              [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-planning-key',
              [MIDSCENE_PLANNING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
              [MIDSCENE_PLANNING_VL_MODE]: 'qwen-vl' as const,
            };
          case 'grounding':
            return {
              [MIDSCENE_GROUNDING_MODEL_NAME]: 'gpt-4-vision',
              [MIDSCENE_GROUNDING_OPENAI_API_KEY]: 'test-grounding-key',
              [MIDSCENE_GROUNDING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
            };
          case 'default':
          default:
            return {
              [MIDSCENE_MODEL_NAME]: 'gpt-4',
              [MIDSCENE_OPENAI_API_KEY]: 'test-key',
              [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
            };
        }
      };

      const manager = new ModelConfigManager(modelConfigFn, mockCreateClient);

      const vqaConfig = manager.getModelConfig('VQA');
      expect(vqaConfig.createOpenAIClient).toBe(mockCreateClient);

      const planningConfig = manager.getModelConfig('planning');
      expect(planningConfig.createOpenAIClient).toBe(mockCreateClient);

      const groundingConfig = manager.getModelConfig('grounding');
      expect(groundingConfig.createOpenAIClient).toBe(mockCreateClient);

      const defaultConfig = manager.getModelConfig('default');
      expect(defaultConfig.createOpenAIClient).toBe(mockCreateClient);
    });

    it('should inject createOpenAIClient into all intent configs in normal mode', () => {
      vi.stubEnv(MIDSCENE_VQA_MODEL_NAME, 'gpt-4-vision');
      vi.stubEnv(MIDSCENE_VQA_OPENAI_API_KEY, 'test-vqa-key');
      vi.stubEnv(MIDSCENE_VQA_OPENAI_BASE_URL, 'https://api.openai.com/v1');

      vi.stubEnv(MIDSCENE_PLANNING_MODEL_NAME, 'qwen-vl-plus');
      vi.stubEnv(MIDSCENE_PLANNING_OPENAI_API_KEY, 'test-planning-key');
      vi.stubEnv(MIDSCENE_PLANNING_OPENAI_BASE_URL, 'https://api.openai.com/v1');
      vi.stubEnv(MIDSCENE_PLANNING_VL_MODE, 'qwen-vl');

      vi.stubEnv(MIDSCENE_GROUNDING_MODEL_NAME, 'gpt-4-vision');
      vi.stubEnv(MIDSCENE_GROUNDING_OPENAI_API_KEY, 'test-grounding-key');
      vi.stubEnv(MIDSCENE_GROUNDING_OPENAI_BASE_URL, 'https://api.openai.com/v1');

      vi.stubEnv(MIDSCENE_MODEL_NAME, 'gpt-4');
      vi.stubEnv(OPENAI_API_KEY, 'test-key');
      vi.stubEnv(OPENAI_BASE_URL, 'https://api.openai.com/v1');

      const mockCreateClient = vi.fn();
      const manager = new ModelConfigManager(undefined, mockCreateClient);
      manager.registerGlobalConfigManager(new GlobalConfigManager());

      const vqaConfig = manager.getModelConfig('VQA');
      expect(vqaConfig.createOpenAIClient).toBe(mockCreateClient);

      const planningConfig = manager.getModelConfig('planning');
      expect(planningConfig.createOpenAIClient).toBe(mockCreateClient);

      const groundingConfig = manager.getModelConfig('grounding');
      expect(groundingConfig.createOpenAIClient).toBe(mockCreateClient);

      const defaultConfig = manager.getModelConfig('default');
      expect(defaultConfig.createOpenAIClient).toBe(mockCreateClient);
    });

    it('should not have createOpenAIClient in config when not provided', () => {
      const modelConfigFn: TModelConfigFn = ({ intent }) => ({
        [MIDSCENE_MODEL_NAME]: 'gpt-4',
        [MIDSCENE_OPENAI_API_KEY]: 'test-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
      });

      const manager = new ModelConfigManager(modelConfigFn);
      const config = manager.getModelConfig('default');

      expect(config.createOpenAIClient).toBeUndefined();
    });

    it('should return the same createOpenAIClient function reference across multiple getModelConfig calls', () => {
      const mockCreateClient = vi.fn();
      const modelConfigFn: TModelConfigFn = ({ intent }) => ({
        [MIDSCENE_MODEL_NAME]: 'gpt-4',
        [MIDSCENE_OPENAI_API_KEY]: 'test-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
      });

      const manager = new ModelConfigManager(modelConfigFn, mockCreateClient);

      const config1 = manager.getModelConfig('default');
      const config2 = manager.getModelConfig('default');
      const config3 = manager.getModelConfig('default');

      expect(config1.createOpenAIClient).toBe(mockCreateClient);
      expect(config2.createOpenAIClient).toBe(mockCreateClient);
      expect(config3.createOpenAIClient).toBe(mockCreateClient);
      expect(config1.createOpenAIClient).toBe(config2.createOpenAIClient);
      expect(config2.createOpenAIClient).toBe(config3.createOpenAIClient);
    });

    it('should inject createOpenAIClient during config initialization, not at getModelConfig call time', () => {
      const mockCreateClient = vi.fn();
      const modelConfigFn: TModelConfigFn = ({ intent }) => ({
        [MIDSCENE_MODEL_NAME]: 'gpt-4',
        [MIDSCENE_OPENAI_API_KEY]: 'test-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
      });

      // Create manager - this should initialize config with createOpenAIClient
      const manager = new ModelConfigManager(modelConfigFn, mockCreateClient);

      // Get config multiple times
      const config1 = manager.getModelConfig('default');
      const config2 = manager.getModelConfig('default');

      // Both should return the exact same object reference (not a new object)
      expect(config1).toBe(config2);
      expect(config1.createOpenAIClient).toBe(mockCreateClient);
    });
  });
});
