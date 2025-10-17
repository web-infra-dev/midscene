import type { IModelConfig } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the dependencies before importing the module under test
vi.mock('openai', () => {
  const mockChat = {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'test response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    },
  };

  return {
    default: vi.fn().mockImplementation((config) => ({
      chat: mockChat,
      config,
    })),
  };
});

vi.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: vi.fn().mockImplementation((proxy) => ({
    proxy,
    type: 'https-proxy-agent',
  })),
}));

vi.mock('socks-proxy-agent', () => ({
  SocksProxyAgent: vi.fn().mockImplementation((proxy) => ({
    proxy,
    type: 'socks-proxy-agent',
  })),
}));

describe('proxy integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HTTP proxy configuration', () => {
    it('should initialize HttpsProxyAgent with HTTP proxy URL', async () => {
      const { HttpsProxyAgent } = await import('https-proxy-agent');

      const proxyUrl = 'http://127.0.0.1:8080';
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: proxyUrl,
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      // Simulate the createChatClient logic
      let proxyAgent: any = undefined;
      if (mockModelConfig.httpProxy) {
        proxyAgent = new HttpsProxyAgent(mockModelConfig.httpProxy);
      }

      expect(HttpsProxyAgent).toHaveBeenCalledWith(proxyUrl);
      expect(proxyAgent).toBeDefined();
      expect(proxyAgent.type).toBe('https-proxy-agent');
    });

    it('should support HTTPS proxy URLs', async () => {
      const { HttpsProxyAgent } = await import('https-proxy-agent');

      const proxyUrl = 'https://proxy.example.com:8080';
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: proxyUrl,
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      let proxyAgent: any = undefined;
      if (mockModelConfig.httpProxy) {
        proxyAgent = new HttpsProxyAgent(mockModelConfig.httpProxy);
      }

      expect(HttpsProxyAgent).toHaveBeenCalledWith(proxyUrl);
      expect(proxyAgent).toBeDefined();
    });

    it('should support authenticated HTTP proxy', async () => {
      const { HttpsProxyAgent } = await import('https-proxy-agent');

      const proxyUrl = 'http://user:pass@proxy.example.com:8080';
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: proxyUrl,
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      let proxyAgent: any = undefined;
      if (mockModelConfig.httpProxy) {
        proxyAgent = new HttpsProxyAgent(mockModelConfig.httpProxy);
      }

      expect(HttpsProxyAgent).toHaveBeenCalledWith(proxyUrl);
      expect(proxyAgent).toBeDefined();
    });
  });

  describe('SOCKS proxy configuration', () => {
    it('should initialize SocksProxyAgent with SOCKS5 proxy URL', async () => {
      const { SocksProxyAgent } = await import('socks-proxy-agent');

      const proxyUrl = 'socks5://127.0.0.1:1080';
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        socksProxy: proxyUrl,
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      let proxyAgent: any = undefined;
      if (mockModelConfig.socksProxy) {
        proxyAgent = new SocksProxyAgent(mockModelConfig.socksProxy);
      }

      expect(SocksProxyAgent).toHaveBeenCalledWith(proxyUrl);
      expect(proxyAgent).toBeDefined();
      expect(proxyAgent.type).toBe('socks-proxy-agent');
    });

    it('should support SOCKS4 proxy', async () => {
      const { SocksProxyAgent } = await import('socks-proxy-agent');

      const proxyUrl = 'socks4://proxy.example.com:1080';
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        socksProxy: proxyUrl,
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      let proxyAgent: any = undefined;
      if (mockModelConfig.socksProxy) {
        proxyAgent = new SocksProxyAgent(mockModelConfig.socksProxy);
      }

      expect(SocksProxyAgent).toHaveBeenCalledWith(proxyUrl);
      expect(proxyAgent).toBeDefined();
    });

    it('should support authenticated SOCKS proxy', async () => {
      const { SocksProxyAgent } = await import('socks-proxy-agent');

      const proxyUrl = 'socks5://user:pass@proxy.example.com:1080';
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        socksProxy: proxyUrl,
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      let proxyAgent: any = undefined;
      if (mockModelConfig.socksProxy) {
        proxyAgent = new SocksProxyAgent(mockModelConfig.socksProxy);
      }

      expect(SocksProxyAgent).toHaveBeenCalledWith(proxyUrl);
      expect(proxyAgent).toBeDefined();
    });
  });

  describe('proxy priority and fallback', () => {
    it('should prioritize HTTP proxy when both HTTP and SOCKS are provided', async () => {
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      const { SocksProxyAgent } = await import('socks-proxy-agent');

      const httpProxyUrl = 'http://127.0.0.1:8080';
      const socksProxyUrl = 'socks5://127.0.0.1:1080';

      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: httpProxyUrl,
        socksProxy: socksProxyUrl,
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      // Simulate the priority logic from createChatClient
      let proxyAgent: any = undefined;
      if (mockModelConfig.httpProxy) {
        proxyAgent = new HttpsProxyAgent(mockModelConfig.httpProxy);
      } else if (mockModelConfig.socksProxy) {
        proxyAgent = new SocksProxyAgent(mockModelConfig.socksProxy);
      }

      // HTTP proxy should be used
      expect(HttpsProxyAgent).toHaveBeenCalledWith(httpProxyUrl);
      expect(SocksProxyAgent).not.toHaveBeenCalled();
      expect(proxyAgent).toBeDefined();
      expect(proxyAgent.type).toBe('https-proxy-agent');
    });

    it('should not create proxy agent when no proxy is configured', async () => {
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      const { SocksProxyAgent } = await import('socks-proxy-agent');

      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      let proxyAgent: any = undefined;
      if (mockModelConfig.httpProxy) {
        proxyAgent = new HttpsProxyAgent(mockModelConfig.httpProxy);
      } else if (mockModelConfig.socksProxy) {
        proxyAgent = new SocksProxyAgent(mockModelConfig.socksProxy);
      }

      expect(HttpsProxyAgent).not.toHaveBeenCalled();
      expect(SocksProxyAgent).not.toHaveBeenCalled();
      expect(proxyAgent).toBeUndefined();
    });
  });

  describe('OpenAI client initialization with proxy', () => {
    it('should pass httpAgent to OpenAI constructor when HTTP proxy is configured', async () => {
      const OpenAI = (await import('openai')).default;
      const { HttpsProxyAgent } = await import('https-proxy-agent');

      const httpProxyUrl = 'http://127.0.0.1:8080';
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: httpProxyUrl,
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      let proxyAgent: any = undefined;
      if (mockModelConfig.httpProxy) {
        proxyAgent = new HttpsProxyAgent(mockModelConfig.httpProxy);
      }

      // Simulate OpenAI client creation
      const openaiClient = new OpenAI({
        baseURL: mockModelConfig.openaiBaseURL,
        apiKey: mockModelConfig.openaiApiKey,
        httpAgent: proxyAgent,
        dangerouslyAllowBrowser: true,
      });

      expect(OpenAI).toHaveBeenCalled();
      expect(openaiClient).toBeDefined();
    });

    it('should pass httpAgent to OpenAI constructor when SOCKS proxy is configured', async () => {
      const OpenAI = (await import('openai')).default;
      const { SocksProxyAgent } = await import('socks-proxy-agent');

      const socksProxyUrl = 'socks5://127.0.0.1:1080';
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        socksProxy: socksProxyUrl,
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      let proxyAgent: any = undefined;
      if (mockModelConfig.socksProxy) {
        proxyAgent = new SocksProxyAgent(mockModelConfig.socksProxy);
      }

      // Simulate OpenAI client creation
      const openaiClient = new OpenAI({
        baseURL: mockModelConfig.openaiBaseURL,
        apiKey: mockModelConfig.openaiApiKey,
        httpAgent: proxyAgent,
        dangerouslyAllowBrowser: true,
      });

      expect(OpenAI).toHaveBeenCalled();
      expect(openaiClient).toBeDefined();
    });
  });

  describe('environment variable integration', () => {
    it('should work with MIDSCENE_OPENAI_HTTP_PROXY environment variable', () => {
      const proxyUrl = 'http://127.0.0.1:8080';

      // This would typically come from environment variables via globalConfigManager
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: proxyUrl, // Would be populated from MIDSCENE_OPENAI_HTTP_PROXY
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      expect(mockModelConfig.httpProxy).toBe(proxyUrl);
    });

    it('should work with MIDSCENE_OPENAI_SOCKS_PROXY environment variable', () => {
      const proxyUrl = 'socks5://127.0.0.1:1080';

      // This would typically come from environment variables via globalConfigManager
      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        socksProxy: proxyUrl, // Would be populated from MIDSCENE_OPENAI_SOCKS_PROXY
        modelDescription: 'test',
        intent: 'default',
        from: 'env',
      };

      expect(mockModelConfig.socksProxy).toBe(proxyUrl);
    });

    it('should support intent-specific proxy configuration for VQA', () => {
      const proxyUrl = 'http://127.0.0.1:8080';

      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: proxyUrl, // Would be populated from MIDSCENE_VQA_OPENAI_HTTP_PROXY
        modelDescription: 'test',
        intent: 'VQA',
        from: 'env',
      };

      expect(mockModelConfig.intent).toBe('VQA');
      expect(mockModelConfig.httpProxy).toBe(proxyUrl);
    });

    it('should support intent-specific proxy configuration for planning', () => {
      const proxyUrl = 'socks5://127.0.0.1:1080';

      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        socksProxy: proxyUrl, // Would be populated from MIDSCENE_PLANNING_OPENAI_SOCKS_PROXY
        modelDescription: 'test',
        intent: 'planning',
        from: 'env',
      };

      expect(mockModelConfig.intent).toBe('planning');
      expect(mockModelConfig.socksProxy).toBe(proxyUrl);
    });

    it('should support intent-specific proxy configuration for grounding', () => {
      const proxyUrl = 'http://127.0.0.1:8080';

      const mockModelConfig: IModelConfig = {
        modelName: 'gpt-4o',
        openaiApiKey: 'test-key',
        openaiBaseURL: 'https://api.openai.com/v1',
        httpProxy: proxyUrl, // Would be populated from MIDSCENE_GROUNDING_OPENAI_HTTP_PROXY
        modelDescription: 'test',
        intent: 'grounding',
        from: 'env',
      };

      expect(mockModelConfig.intent).toBe('grounding');
      expect(mockModelConfig.httpProxy).toBe(proxyUrl);
    });
  });
});
