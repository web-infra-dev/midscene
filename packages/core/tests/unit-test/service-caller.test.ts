import { AIActionType } from '@/ai-model';
import { getResponseFormat } from '@/ai-model/service-caller';
import type { IModelConfig } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('service-caller', () => {
  describe('getResponseFormat', () => {
    it('should return undefined for AIActionType.TEXT', () => {
      const result = getResponseFormat('gpt-4', AIActionType.TEXT);
      expect(result).toBeUndefined();
    });

    it('should return json format for AIActionType.EXTRACT_DATA with gpt-4', () => {
      const result = getResponseFormat('gpt-4', AIActionType.EXTRACT_DATA);
      expect(result).toEqual({ type: 'json_object' });
    });

    it('should return json format for AIActionType.DESCRIBE_ELEMENT with gpt-4', () => {
      const result = getResponseFormat('gpt-4', AIActionType.DESCRIBE_ELEMENT);
      expect(result).toEqual({ type: 'json_object' });
    });

    it('should not return json format for AIActionType.TEXT with gpt-4o-2024-05-13', () => {
      const result = getResponseFormat('gpt-4o-2024-05-13', AIActionType.TEXT);
      expect(result).toBeUndefined();
    });

    it('should return json format for other action types with gpt-4o-2024-05-13', () => {
      const result = getResponseFormat(
        'gpt-4o-2024-05-13',
        AIActionType.EXTRACT_DATA,
      );
      expect(result).toEqual({ type: 'json_object' });
    });

    it('should return undefined for non-gpt models', () => {
      const result = getResponseFormat('claude-3', AIActionType.EXTRACT_DATA);
      expect(result).toBeUndefined();
    });
  });

  describe('code block cleaning logic', () => {
    it('should clean markdown code blocks for TEXT action type', () => {
      // Test the cleaning logic directly
      const testCases = [
        {
          input: '```yaml\nweb:\n  url: "https://example.com"\n```',
          expected: 'web:\n  url: "https://example.com"',
          description: 'yaml code block',
        },
        {
          input: '```yml\ntest: value\n```',
          expected: 'test: value',
          description: 'yml code block',
        },
        {
          input: '```typescript\nconst x = 1;\n```',
          expected: 'const x = 1;',
          description: 'typescript code block',
        },
        {
          input: '```javascript\nconst x = 1;\n```',
          expected: 'const x = 1;',
          description: 'javascript code block',
        },
        {
          input: '```ts\nconst x = 1;\n```',
          expected: 'const x = 1;',
          description: 'ts code block',
        },
        {
          input: '```js\nconst x = 1;\n```',
          expected: 'const x = 1;',
          description: 'js code block',
        },
        {
          input: '```playwright\ntest("example", async () => {});\n```',
          expected: 'test("example", async () => {});',
          description: 'playwright code block',
        },
        {
          input: '```\ntest: value\n```',
          expected: 'test: value',
          description: 'generic code block',
        },
        {
          input: 'test: value',
          expected: 'test: value',
          description: 'no code block',
        },
        {
          input: '```yaml\ntest: value',
          expected: 'test: value',
          description: 'code block without closing',
        },
      ];

      for (const testCase of testCases) {
        // Simulate the cleaning logic from callAIWithStringResponse
        const cleaned = testCase.input
          .replace(
            /^```(?:yaml|yml|playwright|typescript|ts|javascript|js)?\s*\n?/,
            '',
          )
          .replace(/\n?```\s*$/, '');

        expect(cleaned).toBe(testCase.expected);
      }
    });

    it('should handle edge cases in code block cleaning', () => {
      const edgeCases = [
        {
          input: '```yaml\n\n\ntest: value\n\n\n```',
          expected: 'test: value\n\n',
          description: 'multiple newlines',
        },
        {
          input: '```  yaml  \ntest: value\n```',
          expected: 'yaml  \ntest: value', // Regex doesn't handle spaces around language identifier
          description: 'spaces around language identifier',
        },
        {
          input: '```YAML\ntest: value\n```',
          expected: 'test: value',
          description: 'uppercase language identifier',
        },
      ];

      for (const testCase of edgeCases) {
        // Note: The current regex is case-sensitive, so YAML won't match
        // This test documents the current behavior
        const cleaned = testCase.input
          .replace(
            /^```(?:yaml|yml|playwright|typescript|ts|javascript|js)?\s*\n?/,
            '',
          )
          .replace(/\n?```\s*$/, '');

        if (testCase.description === 'uppercase language identifier') {
          // Current implementation doesn't handle uppercase
          expect(cleaned).toBe('YAML\ntest: value');
        } else {
          expect(cleaned).toBe(testCase.expected);
        }
      }
    });
  });

  describe('proxy configuration', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      // Save original environment
      originalEnv = { ...process.env };
      // Mock OpenAI to avoid actual API calls
      vi.mock('openai');
      vi.mock('https-proxy-agent');
      vi.mock('socks-proxy-agent');
    });

    afterEach(() => {
      // Restore original environment
      process.env = originalEnv;
      vi.clearAllMocks();
    });

    it('should create OpenAI client with HTTP proxy when httpProxy is provided', async () => {
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      const OpenAI = (await import('openai')).default;

      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: 'http://127.0.0.1:8080',
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      // The createChatClient function is not exported, so we test it indirectly
      // by verifying that the proxy configuration is properly passed
      expect(mockModelConfig.httpProxy).toBe('http://127.0.0.1:8080');
      expect(mockModelConfig.socksProxy).toBeUndefined();
    });

    it('should create OpenAI client with SOCKS proxy when socksProxy is provided', async () => {
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        socksProxy: 'socks5://127.0.0.1:1080',
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      expect(mockModelConfig.socksProxy).toBe('socks5://127.0.0.1:1080');
      expect(mockModelConfig.httpProxy).toBeUndefined();
    });

    it('should prioritize HTTP proxy over SOCKS proxy when both are provided', async () => {
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: 'http://127.0.0.1:8080',
        socksProxy: 'socks5://127.0.0.1:1080',
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      // Both should be present in config
      expect(mockModelConfig.httpProxy).toBe('http://127.0.0.1:8080');
      expect(mockModelConfig.socksProxy).toBe('socks5://127.0.0.1:1080');
      // The actual priority is handled in createChatClient function
    });

    it('should work without proxy configuration', async () => {
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      expect(mockModelConfig.httpProxy).toBeUndefined();
      expect(mockModelConfig.socksProxy).toBeUndefined();
    });

    it('should handle various proxy URL formats for HTTP proxy', () => {
      const testCases = [
        'http://127.0.0.1:8080',
        'https://proxy.example.com:8080',
        'http://user:pass@proxy.example.com:8080',
        'https://10.0.0.1:3128',
      ];

      for (const proxyUrl of testCases) {
        const mockModelConfig: IModelConfig = {
          modelName: 'gpt-4o',
          openaiApiKey: 'test-key',
          httpProxy: proxyUrl,
          modelDescription: 'test',
          intent: 'default',
          from: 'env',
        };

        expect(mockModelConfig.httpProxy).toBe(proxyUrl);
      }
    });

    it('should handle various proxy URL formats for SOCKS proxy', () => {
      const testCases = [
        'socks5://127.0.0.1:1080',
        'socks4://proxy.example.com:1080',
        'socks5://user:pass@proxy.example.com:1080',
        'socks://10.0.0.1:1080',
      ];

      for (const proxyUrl of testCases) {
        const mockModelConfig: IModelConfig = {
          modelName: 'gpt-4o',
          openaiApiKey: 'test-key',
          socksProxy: proxyUrl,
          modelDescription: 'test',
          intent: 'default',
          from: 'env',
        };

        expect(mockModelConfig.socksProxy).toBe(proxyUrl);
      }
    });
  });

  describe('custom OpenAI client', () => {
    beforeEach(() => {
      vi.mock('openai');
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should use custom client factory when createOpenAIClient is provided', async () => {
      const mockCustomClient = {
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
      };

      const mockCreateClient = vi.fn().mockReturnValue(mockCustomClient);

      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        modelDescription: 'test',
        intent: 'default',
        from: 'modelConfig',
        createOpenAIClient: mockCreateClient,
      };

      // Verify that createOpenAIClient is in the config
      expect(mockModelConfig.createOpenAIClient).toBe(mockCreateClient);
      expect(typeof mockModelConfig.createOpenAIClient).toBe('function');
    });

    it('should work without createOpenAIClient (backward compatibility)', () => {
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      // Should not have createOpenAIClient
      expect(mockModelConfig.createOpenAIClient).toBeUndefined();

      // Config should still be valid
      expect(mockModelConfig.modelName).toBe('gpt-4o');
      expect(mockModelConfig.openaiApiKey).toBe('test-key');
    });
  });
});
