import { getModelRuntime } from '@/ai-model/models';
import type { IModelConfig } from '@midscene/shared/env';
/**
 * Proxy Configuration Tests
 *
 * These tests verify that HTTP and SOCKS proxy configurations are correctly
 * applied when creating OpenAI clients. Uses mocking to verify that the correct
 * proxy implementations are instantiated with proper parameters.
 *
 * The proxy code path in `service-caller` loads `undici`/`fetch-socks` through a
 * *string-literal* dynamic import (`await import('undici')`) that stays lazy at
 * runtime (guarded by `ifInBrowser`) yet is statically analyzable, so
 * `rs.mock('undici')` / `rs.mock('fetch-socks')` intercept it correctly. Web
 * bundlers that must not walk these node-only modules stub them via
 * `resolve.alias: { undici: false, 'fetch-socks': false }` in their rsbuild
 * config instead of relying on the import being non-analyzable.
 */
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

// Mock undici and fetch-socks before importing service-caller
const mockProxyAgent = rs.fn();
const mockSocksDispatcher = rs.fn();

rs.mock('undici', () => ({
  ProxyAgent: mockProxyAgent,
}));

rs.mock('fetch-socks', () => ({
  socksDispatcher: mockSocksDispatcher,
}));

// Mock OpenAI to avoid actual API calls
rs.mock('openai', () => {
  return {
    default: rs.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: rs.fn().mockResolvedValue({
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
    rs.clearAllMocks();
  });

  afterEach(() => {
    rs.clearAllMocks();
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
        slot: 'default',
        timeout: 1000,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, getModelRuntime(modelConfig));

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
        slot: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, getModelRuntime(modelConfig));

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
        slot: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, getModelRuntime(modelConfig));

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
        slot: 'default',
        timeout: 1000,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, getModelRuntime(modelConfig));

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
        slot: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, getModelRuntime(modelConfig));

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
        slot: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, getModelRuntime(modelConfig));

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
        slot: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await expect(
        callAI(messages, getModelRuntime(modelConfig)),
      ).rejects.toThrow(/Invalid SOCKS proxy URL/);
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
        slot: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      // URL without port throws error
      await expect(
        callAI(messages, getModelRuntime(modelConfig)),
      ).rejects.toThrow(/Invalid SOCKS proxy URL/);
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
        slot: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      // URL with invalid port throws error
      await expect(
        callAI(messages, getModelRuntime(modelConfig)),
      ).rejects.toThrow(/Invalid SOCKS proxy URL/);
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
        slot: 'default',
        timeout: 500,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      // URL without hostname throws error
      await expect(
        callAI(messages, getModelRuntime(modelConfig)),
      ).rejects.toThrow(/Invalid SOCKS proxy URL/);
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
        slot: 'default',
        timeout: 1000,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, getModelRuntime(modelConfig));

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
        slot: 'default',
        timeout: 5000,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      await callAI(messages, getModelRuntime(modelConfig));

      // Neither proxy should be used
      expect(mockProxyAgent).not.toHaveBeenCalled();
      expect(mockSocksDispatcher).not.toHaveBeenCalled();
    });
  });
});
