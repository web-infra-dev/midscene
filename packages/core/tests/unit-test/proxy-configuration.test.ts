import type { IModelConfig } from '@midscene/shared/env';
/**
 * Proxy Configuration Tests
 *
 * These tests verify that HTTP and SOCKS proxy configurations are correctly
 * applied when creating OpenAI clients. Uses mocking to verify that the correct
 * proxy implementations are instantiated with proper parameters.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock undici and fetch-socks before importing service-caller
const mockProxyAgent = vi.fn();
const mockSocksDispatcher = vi.fn();

vi.mock('undici', () => ({
  ProxyAgent: mockProxyAgent,
}));

vi.mock('fetch-socks', () => ({
  socksDispatcher: mockSocksDispatcher,
}));

// Mock OpenAI to avoid actual API calls
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'test response' } }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          }),
        },
      },
    })),
  };
});

describe('Proxy Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HTTP Proxy', () => {
    it('should create ProxyAgent with correct HTTP proxy URL', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const httpProxy = 'http://127.0.0.1:9999';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: httpProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 1000,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, modelConfig);

      // Verify ProxyAgent was called with correct URI
      expect(mockProxyAgent).toHaveBeenCalledWith({
        uri: httpProxy,
      });
    });

    it('should support HTTP proxy with authentication', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const httpProxy = 'http://user:pass@127.0.0.1:8888';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        httpProxy: httpProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, modelConfig);

      // Verify ProxyAgent was called with authenticated proxy URL
      expect(mockProxyAgent).toHaveBeenCalledWith({
        uri: httpProxy,
      });
    });

    it('should support HTTPS proxy URLs', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const httpProxy = 'https://proxy.example.com:8080';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        httpProxy: httpProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, modelConfig);

      expect(mockProxyAgent).toHaveBeenCalledWith({
        uri: httpProxy,
      });
    });
  });

  describe('SOCKS Proxy', () => {
    it('should create SOCKS5 dispatcher with correct configuration', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const socksProxy = 'socks5://127.0.0.1:1080';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 1000,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, modelConfig);

      // Verify socksDispatcher was called with correct SOCKS5 config
      expect(mockSocksDispatcher).toHaveBeenCalledWith({
        type: 5,
        host: '127.0.0.1',
        port: 1080,
      });
    });

    it('should parse SOCKS4 proxy URL correctly', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const socksProxy = 'socks4://127.0.0.1:1080';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, modelConfig);

      // Verify socksDispatcher was called with type 4 for SOCKS4
      expect(mockSocksDispatcher).toHaveBeenCalledWith({
        type: 4,
        host: '127.0.0.1',
        port: 1080,
      });
    });

    it('should support SOCKS proxy with authentication', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const socksProxy = 'socks5://user:pass@127.0.0.1:1080';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, modelConfig);

      // Verify socksDispatcher includes authentication
      expect(mockSocksDispatcher).toHaveBeenCalledWith({
        type: 5,
        host: '127.0.0.1',
        port: 1080,
        userId: 'user',
        password: 'pass',
      });
    });

    it('should throw error for invalid SOCKS proxy URL', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const socksProxy = 'invalid-url';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await expect(callAI(messages, modelConfig)).rejects.toThrow(
        /Invalid SOCKS proxy URL/,
      );
    });

    it('should throw error for SOCKS proxy URL missing port', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const socksProxy = 'socks5://127.0.0.1';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      // URL without port throws error
      await expect(callAI(messages, modelConfig)).rejects.toThrow(
        /Invalid SOCKS proxy URL/,
      );
    });

    it('should throw error for SOCKS proxy URL with invalid port', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const socksProxy = 'socks5://127.0.0.1:abc';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      // URL with invalid port throws error
      await expect(callAI(messages, modelConfig)).rejects.toThrow(
        /Invalid SOCKS proxy URL/,
      );
    });

    it('should throw error for SOCKS proxy URL missing hostname', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const socksProxy = 'socks5://:1080';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      // URL without hostname throws error
      await expect(callAI(messages, modelConfig)).rejects.toThrow(
        /Invalid SOCKS proxy URL/,
      );
    });
  });

  describe('Proxy Priority', () => {
    it('should prioritize HTTP proxy when both are configured', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const httpProxy = 'http://127.0.0.1:8888';
      const socksProxy = 'socks5://127.0.0.1:1080';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        httpProxy: httpProxy,
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 1000,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, modelConfig);

      // HTTP proxy should be used
      expect(mockProxyAgent).toHaveBeenCalledWith({
        uri: httpProxy,
      });
      // SOCKS proxy should NOT be used
      expect(mockSocksDispatcher).not.toHaveBeenCalled();
    });
  });

  describe('No Proxy Configuration', () => {
    it('should work without proxy configuration', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        modelDescription: 'test',
        intent: 'default',
        timeout: 5000,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, modelConfig);

      // Neither proxy should be used
      expect(mockProxyAgent).not.toHaveBeenCalled();
      expect(mockSocksDispatcher).not.toHaveBeenCalled();
    });
  });
});
