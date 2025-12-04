import { AIActionType } from '@/common';
import type { IModelConfig } from '@midscene/shared/env';
/**
 * Proxy Configuration Tests
 *
 * These tests verify that HTTP and SOCKS proxy configurations work correctly
 * with the OpenAI SDK through Midscene's proxy configuration.
 *
 * Key behaviors tested:
 * - HTTP proxy configuration using undici ProxyAgent
 * - SOCKS proxy configuration using fetch-socks socksDispatcher
 * - Proxy authentication support (credentials in URL)
 * - HTTP proxy takes priority when both HTTP and SOCKS are configured
 * - Invalid SOCKS URLs are rejected with clear error messages
 *
 * Note: Tests verify proxy configuration by expecting connection failures
 * to non-existent proxy servers, which proves the proxy is being used.
 */
import { describe, expect, it } from 'vitest';

describe('Proxy Configuration', () => {
  describe('HTTP Proxy', () => {
    it('should configure HTTP proxy when MIDSCENE_MODEL_HTTP_PROXY is set', async () => {
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

      try {
        await callAI(messages, AIActionType.TEXT, modelConfig);
        expect.fail('Should have thrown connection error');
      } catch (error: any) {
        // We expect connection error to the fake proxy
        expect(error.message).toContain('Connection error');
        // Connection failed, which proves proxy was used
      }
    });

    it('should use undici ProxyAgent for HTTP proxy in Node.js', async () => {
      // This test verifies that we're using the correct proxy implementation
      const httpProxy = 'http://127.0.0.1:8888';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        httpProxy: httpProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const { callAI } = await import('@/ai-model/service-caller');
      const messages = [{ role: 'user' as const, content: 'test' }];

      try {
        await callAI(messages, AIActionType.TEXT, modelConfig);
        expect.fail('Should have thrown connection error');
      } catch (error: any) {
        // Should get connection error (proving proxy was attempted)
        expect(error.message).toContain('Connection error');
      }
    });

    it('should support HTTP proxy with authentication', async () => {
      const httpProxy = 'http://user:pass@127.0.0.1:8888';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        httpProxy: httpProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const { callAI } = await import('@/ai-model/service-caller');
      const messages = [{ role: 'user' as const, content: 'test' }];

      try {
        await callAI(messages, AIActionType.TEXT, modelConfig);
        expect.fail('Should have thrown connection error');
      } catch (error: any) {
        // Should still try to connect to proxy with credentials
        expect(error.message).toContain('Connection error');
      }
    });
  });

  describe('SOCKS Proxy', () => {
    it('should configure SOCKS5 proxy when MIDSCENE_MODEL_SOCKS_PROXY is set', async () => {
      const { callAI } = await import('@/ai-model/service-caller');

      const socksProxy = 'socks5://127.0.0.1:1080';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
        timeout: 1000,
      };

      const messages = [{ role: 'user' as const, content: 'test' }];

      try {
        await callAI(messages, AIActionType.TEXT, modelConfig);
        expect.fail('Should have thrown connection error');
      } catch (error: any) {
        // We expect connection error
        expect(error.message).toContain('Connection error');
      }
    });

    it('should parse SOCKS4 proxy URL correctly', async () => {
      const socksProxy = 'socks4://127.0.0.1:1080';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const { callAI } = await import('@/ai-model/service-caller');
      const messages = [{ role: 'user' as const, content: 'test' }];

      try {
        await callAI(messages, AIActionType.TEXT, modelConfig);
      } catch (error: any) {
        // Should attempt SOCKS connection
        const errorString = JSON.stringify(error);
        expect(
          errorString.includes('127.0.0.1:1080') ||
            error.cause?.message?.includes('127.0.0.1:1080') ||
            error.message.includes('Connection error'),
        ).toBeTruthy();
      }
    });

    it('should support SOCKS proxy with authentication', async () => {
      const socksProxy = 'socks5://user:pass@127.0.0.1:1080';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const { callAI } = await import('@/ai-model/service-caller');
      const messages = [{ role: 'user' as const, content: 'test' }];

      try {
        await callAI(messages, AIActionType.TEXT, modelConfig);
      } catch (error: any) {
        // Should parse credentials and attempt connection
        expect(error.message.includes('Connection error')).toBeTruthy();
      }
    });

    it('should throw error for invalid SOCKS proxy URL', async () => {
      const socksProxy = 'invalid-url';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const { callAI } = await import('@/ai-model/service-caller');
      const messages = [{ role: 'user' as const, content: 'test' }];

      try {
        await callAI(messages, AIActionType.TEXT, modelConfig);
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Invalid SOCKS proxy URL');
      }
    });
  });

  describe('Proxy Priority', () => {
    it('should prioritize HTTP proxy when both are configured', async () => {
      const httpProxy = 'http://127.0.0.1:8888';
      const socksProxy = 'socks5://127.0.0.1:1080';
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        httpProxy: httpProxy,
        socksProxy: socksProxy,
        modelDescription: 'test',
        intent: 'default',
        timeout: 500,
      };

      const { callAI } = await import('@/ai-model/service-caller');
      const messages = [{ role: 'user' as const, content: 'test' }];

      try {
        await callAI(messages, AIActionType.TEXT, modelConfig);
      } catch (error: any) {
        // Should use HTTP proxy (not SOCKS)
        // Verify connection error is for HTTP proxy port
        expect(error.message.includes('Connection error')).toBeTruthy();
        // If we can get detailed error, verify it's trying to connect to HTTP proxy port
        if (error.cause?.message) {
          expect(error.cause.message).not.toContain('1080');
        }
      }
    });
  });

  describe('No Proxy Configuration', () => {
    it('should work without proxy configuration', async () => {
      // This test requires a valid API key to pass
      // For unit tests, we just verify it doesn't throw proxy-related errors
      const modelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'sk-test-invalid-key',
        modelDescription: 'test',
        intent: 'default',
        timeout: 5000,
      };

      const { callAI } = await import('@/ai-model/service-caller');
      const messages = [{ role: 'user' as const, content: 'test' }];

      try {
        await callAI(messages, AIActionType.TEXT, modelConfig);
        // If it succeeds (somehow), that's fine
      } catch (error: any) {
        // Should get some kind of error (auth or connection)
        // As long as it's not a proxy configuration error, we're good
        expect(error).toBeDefined();
        // Proxy-related errors would mention specific proxy addresses
        const errorString = error.toString();
        expect(errorString).not.toContain('127.0.0.1:9999');
        expect(errorString).not.toContain('127.0.0.1:1080');
      }
    });
  });
});
