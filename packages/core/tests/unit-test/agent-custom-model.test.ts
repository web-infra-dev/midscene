import { Agent } from '@/agent';
import type { CreateOpenAIClientFn } from '@midscene/shared/env';
import {
  MIDSCENE_INSIGHT_MODEL_API_KEY,
  MIDSCENE_INSIGHT_MODEL_BASE_URL,
  MIDSCENE_INSIGHT_MODEL_NAME,
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_PLANNING_MODEL_API_KEY,
  MIDSCENE_PLANNING_MODEL_BASE_URL,
  MIDSCENE_PLANNING_MODEL_NAME,
} from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const defaultModelConfig = {
  [MIDSCENE_MODEL_NAME]: 'qwen2.5-vl-max',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.sample.com/v1',
  [MIDSCENE_MODEL_FAMILY]: 'qwen2.5-vl' as const,
};

const complexModelConfig = {
  ...defaultModelConfig,
  [MIDSCENE_PLANNING_MODEL_NAME]: 'gpt-5.1',
  [MIDSCENE_PLANNING_MODEL_API_KEY]: 'test-planning-key',
  [MIDSCENE_PLANNING_MODEL_BASE_URL]: 'https://api.smaple-planning.com/v1',
  [MIDSCENE_INSIGHT_MODEL_NAME]: 'model-for-insight',
  [MIDSCENE_INSIGHT_MODEL_API_KEY]: 'test-insight-key',
  [MIDSCENE_INSIGHT_MODEL_BASE_URL]: 'https://api.sample-insight.com/v1',
};

const createMockInterface = () =>
  ({
    interfaceType: 'puppeteer',
    actionSpace: () => [],
  }) as any;

describe('Agent with custom OpenAI client', () => {
  beforeEach(() => {
    vi.mock('openai');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('default modelConfig without createOpenAIClient', () => {
    it('should work without createOpenAIClient', () => {
      const mockInterface = createMockInterface();

      const agent = new Agent(mockInterface, {
        modelConfig: defaultModelConfig,
      });

      expect(agent).toBeInstanceOf(Agent);

      const defaultConfig = (agent as any).modelConfigManager.getModelConfig(
        'default',
      );
      expect(defaultConfig).toMatchInlineSnapshot(`
        {
          "createOpenAIClient": undefined,
          "httpProxy": undefined,
          "intent": "default",
          "modelDescription": "qwen2.5-vl mode",
          "modelName": "qwen2.5-vl-max",
          "openaiApiKey": "test-key",
          "openaiBaseURL": "https://api.sample.com/v1",
          "openaiExtraConfig": undefined,
          "socksProxy": undefined,
          "timeout": undefined,
          "uiTarsModelVersion": undefined,
          "vlMode": "qwen2.5-vl",
          "vlModeRaw": "qwen2.5-vl",
        }
      `);

      const planningConfig = (agent as any).modelConfigManager.getModelConfig(
        'planning',
      );
      expect(planningConfig).toMatchInlineSnapshot(`
        {
          "createOpenAIClient": undefined,
          "httpProxy": undefined,
          "intent": "default",
          "modelDescription": "qwen2.5-vl mode",
          "modelName": "qwen2.5-vl-max",
          "openaiApiKey": "test-key",
          "openaiBaseURL": "https://api.sample.com/v1",
          "openaiExtraConfig": undefined,
          "socksProxy": undefined,
          "timeout": undefined,
          "uiTarsModelVersion": undefined,
          "vlMode": "qwen2.5-vl",
          "vlModeRaw": "qwen2.5-vl",
        }
      `);

      const insightConfig = (agent as any).modelConfigManager.getModelConfig(
        'insight',
      );
      expect(insightConfig).toMatchInlineSnapshot(`
        {
          "createOpenAIClient": undefined,
          "httpProxy": undefined,
          "intent": "default",
          "modelDescription": "qwen2.5-vl mode",
          "modelName": "qwen2.5-vl-max",
          "openaiApiKey": "test-key",
          "openaiBaseURL": "https://api.sample.com/v1",
          "openaiExtraConfig": undefined,
          "socksProxy": undefined,
          "timeout": undefined,
          "uiTarsModelVersion": undefined,
          "vlMode": "qwen2.5-vl",
          "vlModeRaw": "qwen2.5-vl",
        }
      `);
    });
  });

  describe('complex modelConfig without createOpenAIClient', () => {
    it('should work without createOpenAIClient', () => {
      const mockInterface = createMockInterface();

      const agent = new Agent(mockInterface, {
        modelConfig: complexModelConfig,
      });

      expect(agent).toBeInstanceOf(Agent);

      const defaultConfig = (agent as any).modelConfigManager.getModelConfig(
        'default',
      );
      expect(defaultConfig).toMatchInlineSnapshot(`
        {
          "createOpenAIClient": undefined,
          "httpProxy": undefined,
          "intent": "default",
          "modelDescription": "qwen2.5-vl mode",
          "modelName": "qwen2.5-vl-max",
          "openaiApiKey": "test-key",
          "openaiBaseURL": "https://api.sample.com/v1",
          "openaiExtraConfig": undefined,
          "socksProxy": undefined,
          "timeout": undefined,
          "uiTarsModelVersion": undefined,
          "vlMode": "qwen2.5-vl",
          "vlModeRaw": "qwen2.5-vl",
        }
      `);

      const planningConfig = (agent as any).modelConfigManager.getModelConfig(
        'planning',
      );
      expect(planningConfig).toMatchInlineSnapshot(`
        {
          "createOpenAIClient": undefined,
          "httpProxy": undefined,
          "intent": "planning",
          "modelDescription": "",
          "modelName": "gpt-5.1",
          "openaiApiKey": "test-planning-key",
          "openaiBaseURL": "https://api.smaple-planning.com/v1",
          "openaiExtraConfig": undefined,
          "socksProxy": undefined,
          "timeout": undefined,
          "uiTarsModelVersion": undefined,
          "vlMode": undefined,
          "vlModeRaw": undefined,
        }
      `);

      const insightConfig = (agent as any).modelConfigManager.getModelConfig(
        'insight',
      );
      expect(insightConfig).toMatchInlineSnapshot(`
        {
          "createOpenAIClient": undefined,
          "httpProxy": undefined,
          "intent": "insight",
          "modelDescription": "",
          "modelName": "model-for-insight",
          "openaiApiKey": "test-insight-key",
          "openaiBaseURL": "https://api.sample-insight.com/v1",
          "openaiExtraConfig": undefined,
          "socksProxy": undefined,
          "timeout": undefined,
          "uiTarsModelVersion": undefined,
          "vlMode": undefined,
          "vlModeRaw": undefined,
        }
      `);
    });
  });

  describe('constructor with createOpenAIClient', () => {
    it('should accept createOpenAIClient in AgentOpt with modelConfig', () => {
      const mockCreateClient = vi.fn(async () => ({
        chat: { completions: { create: vi.fn() } },
      }));

      // Create a mock interface instance
      const mockInterface = createMockInterface();

      const agent = new Agent(mockInterface, {
        modelConfig: defaultModelConfig,
        createOpenAIClient: mockCreateClient,
      });

      expect(agent).toBeInstanceOf(Agent);
      expect(mockCreateClient).not.toHaveBeenCalled(); // Not called in constructor
    });

    it('should pass createOpenAIClient to ModelConfigManager when modelConfig is provided', () => {
      const mockCreateClient = vi.fn(async () => ({
        chat: { completions: { create: vi.fn() } },
      }));

      // Create a mock interface instance
      const mockInterface = createMockInterface();

      const agent = new Agent(mockInterface, {
        modelConfig: defaultModelConfig,
        createOpenAIClient: mockCreateClient,
      });

      // Access the private modelConfigManager through type assertion
      const modelConfig = (agent as any).modelConfigManager.getModelConfig(
        'default',
      );
      expect(modelConfig.createOpenAIClient).toBe(mockCreateClient);
    });

    it('should work without createOpenAIClient (backward compatibility)', () => {
      // Create a mock interface instance
      const mockInterface = createMockInterface();

      const agent = new Agent(mockInterface, {
        modelConfig: defaultModelConfig,
      });

      expect(agent).toBeInstanceOf(Agent);

      const modelConfig = (agent as any).modelConfigManager.getModelConfig(
        'default',
      );
      expect(modelConfig.createOpenAIClient).toBeUndefined();
    });
  });

  describe('intent-specific custom clients', () => {
    it('should support different clients for different intents', () => {
      const mockCreateClient: CreateOpenAIClientFn = vi.fn(
        async (_client, opts) => {
          const { apiKey } = opts as { apiKey?: string };
          // Return different mock clients based on provided options
          return {
            chat: { completions: { create: vi.fn() } },
            _apiKey: apiKey, // For testing purposes
          };
        },
      );

      // Create a mock interface instance
      const mockInterface = createMockInterface();

      const agent = new Agent(mockInterface, {
        modelConfig: complexModelConfig,
        createOpenAIClient: mockCreateClient,
      });

      const planningConfig = (agent as any).modelConfigManager.getModelConfig(
        'planning',
      );
      expect(planningConfig.createOpenAIClient).toBe(mockCreateClient);
      expect(planningConfig.intent).toBe('planning');

      const defaultConfig = (agent as any).modelConfigManager.getModelConfig(
        'default',
      );
      expect(defaultConfig.createOpenAIClient).toBe(mockCreateClient);
      expect(defaultConfig.intent).toBe('default');
    });
  });

  describe('observability wrapper integration', () => {
    it('should support wrapping clients with langsmith-style wrappers', async () => {
      const mockWrapOpenAI = vi.fn((client, options) => ({
        ...client,
        _wrapped: true,
        _options: options,
      }));

      const mockCreateClient: CreateOpenAIClientFn = vi.fn(
        async (client, opts) => {
          const options = opts as { apiKey?: string };

          // Wrap planning clients with observability
          if (options.apiKey === 'planning-key') {
            return mockWrapOpenAI(client, {
              projectName: 'midscene-planning',
              metadata: { apiKey: options.apiKey },
            }) as any;
          }

          return client as any;
        },
      );

      // Create a mock interface instance
      const mockInterface = createMockInterface();

      const agent = new Agent(mockInterface, {
        modelConfig: {
          [MIDSCENE_MODEL_NAME]: 'gpt-4o',
          [MIDSCENE_MODEL_API_KEY]: 'default-key',
          [MIDSCENE_MODEL_BASE_URL]: 'https://api.openai.com/v1',
          [MIDSCENE_PLANNING_MODEL_NAME]: 'qwen-vl-plus',
          [MIDSCENE_PLANNING_MODEL_API_KEY]: 'planning-key',
          [MIDSCENE_PLANNING_MODEL_BASE_URL]: 'https://api.openai.com/v1',
          [MIDSCENE_MODEL_FAMILY]: 'qwen2.5-vl' as const,
        },
        createOpenAIClient: mockCreateClient,
      });

      expect(agent).toBeInstanceOf(Agent);

      // Planning config should have wrapped client creator
      const planningConfig = (agent as any).modelConfigManager.getModelConfig(
        'planning',
      );
      expect(planningConfig.createOpenAIClient).toBeDefined();

      // Simulate calling the client creator
      const baseClient = { chat: { completions: { create: vi.fn() } } };
      const clientOptions = {
        baseURL: planningConfig.openaiBaseURL,
        apiKey: planningConfig.openaiApiKey,
        dangerouslyAllowBrowser: true,
      };

      const planningClient = await planningConfig.createOpenAIClient!(
        baseClient,
        clientOptions,
      );

      expect(mockWrapOpenAI).toHaveBeenCalledWith(baseClient, {
        projectName: 'midscene-planning',
        metadata: { apiKey: 'planning-key' },
      });

      expect(planningClient).toMatchObject({
        _wrapped: true,
        _options: {
          projectName: 'midscene-planning',
          metadata: { apiKey: 'planning-key' },
        },
      });
    });

    it('should provide all config parameters to createOpenAIClient', async () => {
      const mockCreateClient: CreateOpenAIClientFn = vi.fn(async () => ({
        chat: { completions: { create: vi.fn() } },
      }));

      // Create a mock interface instance
      const mockInterface = createMockInterface();

      const agent = new Agent(mockInterface, {
        modelConfig: {
          [MIDSCENE_MODEL_NAME]: 'gpt-4o',
          [MIDSCENE_MODEL_API_KEY]: 'test-api-key',
          [MIDSCENE_MODEL_BASE_URL]: 'https://custom.openai.com/v1',
        },
        createOpenAIClient: mockCreateClient,
      });

      const config = (agent as any).modelConfigManager.getModelConfig(
        'default',
      );

      // Simulate what createChatClient does
      const baseClient = { chat: { completions: { create: vi.fn() } } };
      const options = {
        baseURL: config.openaiBaseURL,
        apiKey: config.openaiApiKey,
        dangerouslyAllowBrowser: true,
      };

      await config.createOpenAIClient!(baseClient, options);

      expect(mockCreateClient).toHaveBeenCalledWith(baseClient, options);
    });
  });

  describe('performance characteristics', () => {
    it('should inject createOpenAIClient during config initialization, not on getModelConfig', () => {
      const mockCreateClient = vi.fn(async () => ({
        chat: { completions: { create: vi.fn() } },
      }));

      // Create a mock interface instance
      const mockInterface = createMockInterface();

      const agent = new Agent(mockInterface, {
        modelConfig: defaultModelConfig,
        createOpenAIClient: mockCreateClient,
      });

      const modelConfigManager = (agent as any).modelConfigManager;

      // Get config multiple times
      const config1 = modelConfigManager.getModelConfig('default');
      const config2 = modelConfigManager.getModelConfig('default');
      const config3 = modelConfigManager.getModelConfig('default');

      // All should return the same object reference
      expect(config1).toBe(config2);
      expect(config2).toBe(config3);

      // createOpenAIClient should be the same reference
      expect(config1.createOpenAIClient).toBe(mockCreateClient);
      expect(config2.createOpenAIClient).toBe(mockCreateClient);
      expect(config3.createOpenAIClient).toBe(mockCreateClient);
    });
  });
});
