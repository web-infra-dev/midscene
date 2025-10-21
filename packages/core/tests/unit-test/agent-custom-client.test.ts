import { Agent } from '@/agent';
import type { CreateOpenAIClientFn } from '@midscene/shared/env';
import {
  MIDSCENE_MODEL_NAME,
  MIDSCENE_OPENAI_API_KEY,
  MIDSCENE_OPENAI_BASE_URL,
  MIDSCENE_PLANNING_MODEL_NAME,
  MIDSCENE_PLANNING_OPENAI_API_KEY,
  MIDSCENE_PLANNING_OPENAI_BASE_URL,
  MIDSCENE_PLANNING_VL_MODE,
} from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Agent with custom OpenAI client', () => {
  beforeEach(() => {
    vi.mock('openai');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor with createOpenAIClient', () => {
    it('should accept createOpenAIClient in AgentOpt with modelConfig', () => {
      const mockCreateClient = vi.fn().mockReturnValue({
        chat: { completions: { create: vi.fn() } },
      });

      // Create a mock interface instance
      const mockInterface = {} as any;

      const agent = new Agent(mockInterface, {
        modelConfig: ({ intent }) => ({
          [MIDSCENE_MODEL_NAME]: 'gpt-4o',
          [MIDSCENE_OPENAI_API_KEY]: 'test-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        }),
        createOpenAIClient: mockCreateClient,
      });

      expect(agent).toBeInstanceOf(Agent);
      expect(mockCreateClient).not.toHaveBeenCalled(); // Not called in constructor
    });

    it('should pass createOpenAIClient to ModelConfigManager when modelConfig is provided', () => {
      const mockCreateClient = vi.fn().mockReturnValue({
        chat: { completions: { create: vi.fn() } },
      });

      // Create a mock interface instance
      const mockInterface = {} as any;

      const agent = new Agent(mockInterface, {
        modelConfig: ({ intent }) => ({
          [MIDSCENE_MODEL_NAME]: 'gpt-4o',
          [MIDSCENE_OPENAI_API_KEY]: 'test-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        }),
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
      const mockInterface = {} as any;

      const agent = new Agent(mockInterface, {
        modelConfig: ({ intent }) => ({
          [MIDSCENE_MODEL_NAME]: 'gpt-4o',
          [MIDSCENE_OPENAI_API_KEY]: 'test-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        }),
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
      const mockCreateClient: CreateOpenAIClientFn = vi
        .fn()
        .mockImplementation((config) => {
          // Return different mock clients based on intent
          return {
            chat: { completions: { create: vi.fn() } },
            _intent: config.intent, // For testing purposes
          };
        });

      // Create a mock interface instance
      const mockInterface = {} as any;

      const agent = new Agent(mockInterface, {
        modelConfig: ({ intent }) => {
          switch (intent) {
            case 'planning':
              return {
                [MIDSCENE_PLANNING_MODEL_NAME]: 'qwen-vl-plus',
                [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-planning-key',
                [MIDSCENE_PLANNING_OPENAI_BASE_URL]:
                  'https://api.openai.com/v1',
                [MIDSCENE_PLANNING_VL_MODE]: 'qwen-vl' as const,
              };
            default:
              return {
                [MIDSCENE_MODEL_NAME]: 'gpt-4o',
                [MIDSCENE_OPENAI_API_KEY]: 'test-key',
                [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
              };
          }
        },
        createOpenAIClient: mockCreateClient,
      });

      const planningConfig = (
        agent as any
      ).modelConfigManager.getModelConfig('planning');
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
    it('should support wrapping clients with langsmith-style wrappers', () => {
      const mockWrapOpenAI = vi.fn((client, options) => ({
        ...client,
        _wrapped: true,
        _options: options,
      }));

      const mockCreateClient: CreateOpenAIClientFn = (config) => {
        const baseClient = {
          chat: { completions: { create: vi.fn() } },
        };

        // Wrap planning clients with observability
        if (config.intent === 'planning') {
          return mockWrapOpenAI(baseClient, {
            projectName: 'midscene-planning',
            metadata: { intent: config.intent },
          }) as any;
        }

        return baseClient as any;
      };

      // Create a mock interface instance
      const mockInterface = {} as any;

      const agent = new Agent(mockInterface, {
        modelConfig: ({ intent }) => {
          if (intent === 'planning') {
            return {
              [MIDSCENE_PLANNING_MODEL_NAME]: 'qwen-vl-plus',
              [MIDSCENE_PLANNING_OPENAI_API_KEY]: 'test-key',
              [MIDSCENE_PLANNING_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
              [MIDSCENE_PLANNING_VL_MODE]: 'qwen-vl' as const,
            };
          }
          return {
            [MIDSCENE_MODEL_NAME]: 'gpt-4o',
            [MIDSCENE_OPENAI_API_KEY]: 'test-key',
            [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
          };
        },
        createOpenAIClient: mockCreateClient,
      });

      expect(agent).toBeInstanceOf(Agent);

      // Planning config should have wrapped client creator
      const planningConfig = (
        agent as any
      ).modelConfigManager.getModelConfig('planning');
      expect(planningConfig.createOpenAIClient).toBeDefined();

      // Simulate calling the client creator
      const planningClient = planningConfig.createOpenAIClient!({
        modelName: planningConfig.modelName,
        openaiApiKey: planningConfig.openaiApiKey,
        intent: planningConfig.intent,
        modelDescription: planningConfig.modelDescription,
        vlMode: planningConfig.vlMode,
      });

      expect(mockWrapOpenAI).toHaveBeenCalledWith(expect.any(Object), {
        projectName: 'midscene-planning',
        metadata: { intent: 'planning' },
      });

      expect(planningClient).toMatchObject({
        _wrapped: true,
        _options: {
          projectName: 'midscene-planning',
          metadata: { intent: 'planning' },
        },
      });
    });

    it('should provide all config parameters to createOpenAIClient', () => {
      const mockCreateClient = vi.fn().mockReturnValue({
        chat: { completions: { create: vi.fn() } },
      });

      // Create a mock interface instance
      const mockInterface = {} as any;

      const agent = new Agent(mockInterface, {
        modelConfig: ({ intent }) => ({
          [MIDSCENE_MODEL_NAME]: 'gpt-4o',
          [MIDSCENE_OPENAI_API_KEY]: 'test-api-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://custom.openai.com/v1',
        }),
        createOpenAIClient: mockCreateClient,
      });

      const config = (agent as any).modelConfigManager.getModelConfig(
        'default',
      );

      // Simulate what createChatClient does
      config.createOpenAIClient!({
        modelName: config.modelName,
        openaiApiKey: config.openaiApiKey,
        openaiBaseURL: config.openaiBaseURL,
        socksProxy: config.socksProxy,
        httpProxy: config.httpProxy,
        openaiExtraConfig: config.openaiExtraConfig,
        vlMode: config.vlMode,
        intent: config.intent,
        modelDescription: config.modelDescription,
      });

      expect(mockCreateClient).toHaveBeenCalledWith({
        modelName: 'gpt-4o',
        openaiApiKey: 'test-api-key',
        openaiBaseURL: 'https://custom.openai.com/v1',
        socksProxy: undefined,
        httpProxy: undefined,
        openaiExtraConfig: undefined,
        vlMode: undefined,
        intent: 'default',
        modelDescription: expect.any(String),
      });
    });
  });

  describe('performance characteristics', () => {
    it('should inject createOpenAIClient during config initialization, not on getModelConfig', () => {
      const mockCreateClient = vi.fn().mockReturnValue({
        chat: { completions: { create: vi.fn() } },
      });

      // Create a mock interface instance
      const mockInterface = {} as any;

      const agent = new Agent(mockInterface, {
        modelConfig: ({ intent }) => ({
          [MIDSCENE_MODEL_NAME]: 'gpt-4o',
          [MIDSCENE_OPENAI_API_KEY]: 'test-key',
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
        }),
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
