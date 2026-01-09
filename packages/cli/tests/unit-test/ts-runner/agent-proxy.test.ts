import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CdpConfig, LaunchConfig } from '../../../src/ts-runner/types';

// Mock puppeteer
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn(),
    connect: vi.fn(),
  },
}));

// Mock @midscene/web/puppeteer
const mockPuppeteerAgent = vi.fn();
vi.mock('@midscene/web/puppeteer', () => ({
  PuppeteerAgent: mockPuppeteerAgent,
}));

describe('AgentProxy', () => {
  let AgentProxy: any;
  let puppeteerMock: any;
  let browserMock: any;
  let pageMock: any;
  let puppeteerAgentMock: any;

  const setupMockFetch = (webSocketDebuggerUrl: string) => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ webSocketDebuggerUrl }),
    });
    vi.stubGlobal('fetch', mockFetch);
    return mockFetch;
  };

  const setupFailedFetch = () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', mockFetch);
    return mockFetch;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    pageMock = {
      url: vi.fn().mockReturnValue('https://example.com'),
      setViewport: vi.fn().mockResolvedValue(undefined),
      goto: vi.fn().mockResolvedValue(undefined),
    };

    browserMock = {
      newPage: vi.fn().mockResolvedValue(pageMock),
      pages: vi.fn().mockResolvedValue([pageMock]),
      close: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    };

    puppeteerMock = {
      default: {
        launch: vi.fn().mockResolvedValue(browserMock),
        connect: vi.fn().mockResolvedValue(browserMock),
      },
    };
    vi.mocked(await import('puppeteer')).default = puppeteerMock.default;

    puppeteerAgentMock = {
      aiAct: vi.fn().mockResolvedValue('aiAct result'),
      aiAction: vi.fn().mockResolvedValue('aiAction result'),
      aiQuery: vi.fn().mockResolvedValue('aiQuery result'),
      aiAssert: vi.fn().mockResolvedValue(undefined),
      aiLocate: vi.fn().mockResolvedValue('aiLocate result'),
      aiWaitFor: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    mockPuppeteerAgent.mockReturnValue(puppeteerAgentMock);

    vi.stubGlobal('fetch', vi.fn());

    const module = await import('../../../src/ts-runner/agent-proxy');
    AgentProxy = module.AgentProxy;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('connect', () => {
    test('should connect with auto discovery when no config provided', async () => {
      const agent = new AgentProxy();
      const mockFetch = setupMockFetch(
        'ws://localhost:9222/devtools/browser/abc123',
      );

      await agent.connect();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:9222/json/version',
      );
      expect(puppeteerMock.default.connect).toHaveBeenCalledWith({
        browserWSEndpoint: 'ws://localhost:9222/devtools/browser/abc123',
      });
      expect(mockPuppeteerAgent).toHaveBeenCalledWith(pageMock);
    });

    test('should connect with string endpoint', async () => {
      const agent = new AgentProxy();
      const endpoint = 'ws://localhost:9222/devtools/browser/abc123';

      await agent.connect(endpoint);

      expect(puppeteerMock.default.connect).toHaveBeenCalledWith({
        browserWSEndpoint: endpoint,
      });
      expect(mockPuppeteerAgent).toHaveBeenCalledWith(pageMock);
    });

    test('should connect with object config', async () => {
      const agent = new AgentProxy();
      const config: CdpConfig = {
        endpoint: 'ws://localhost:9222/devtools/browser/abc123',
      };

      await agent.connect(config);

      expect(puppeteerMock.default.connect).toHaveBeenCalledWith({
        browserWSEndpoint: config.endpoint,
      });
      expect(mockPuppeteerAgent).toHaveBeenCalledWith(pageMock);
    });

    test('should add apiKey to endpoint URL', async () => {
      const agent = new AgentProxy();
      const config: CdpConfig = {
        endpoint: 'wss://connect.browserbase.com',
        apiKey: 'test-api-key',
      };

      await agent.connect(config);

      expect(puppeteerMock.default.connect).toHaveBeenCalledWith({
        browserWSEndpoint: 'wss://connect.browserbase.com/?apiKey=test-api-key',
      });
    });

    test('should append apiKey to endpoint URL with existing query params', async () => {
      const agent = new AgentProxy();
      const config: CdpConfig = {
        endpoint: 'wss://connect.browserbase.com?session=abc',
        apiKey: 'test-api-key',
      };

      await agent.connect(config);

      expect(puppeteerMock.default.connect).toHaveBeenCalledWith({
        browserWSEndpoint:
          'wss://connect.browserbase.com/?session=abc&apiKey=test-api-key',
      });
    });

    test('should select tab by URL', async () => {
      const agent = new AgentProxy();
      const config: CdpConfig = {
        endpoint: 'ws://localhost:9222/devtools/browser/abc123',
        tabUrl: 'example.com',
      };

      const secondPageMock = {
        url: vi.fn().mockReturnValue('https://example.com/page2'),
      };
      browserMock.pages.mockResolvedValue([pageMock, secondPageMock]);

      await agent.connect(config);

      expect(browserMock.pages).toHaveBeenCalled();
      // pageMock.url() returns 'https://example.com', which includes 'example.com'
      expect(mockPuppeteerAgent).toHaveBeenCalledWith(pageMock);
    });

    test('should select tab by index', async () => {
      const agent = new AgentProxy();
      const config: CdpConfig = {
        endpoint: 'ws://localhost:9222/devtools/browser/abc123',
        tabIndex: 1,
      };

      const secondPageMock = {
        url: vi.fn().mockReturnValue('https://example.com/page2'),
      };
      browserMock.pages.mockResolvedValue([pageMock, secondPageMock]);

      await agent.connect(config);

      expect(browserMock.pages).toHaveBeenCalled();
      expect(mockPuppeteerAgent).toHaveBeenCalledWith(secondPageMock);
    });

    test('should not switch page when tabUrl does not match any page', async () => {
      const agent = new AgentProxy();
      const config: CdpConfig = {
        endpoint: 'ws://localhost:9222/devtools/browser/abc123',
        tabUrl: 'nonexistent.com',
      };

      browserMock.pages.mockResolvedValue([pageMock]);

      await agent.connect(config);

      // Should still use the first page from connectToEndpoint
      expect(mockPuppeteerAgent).toHaveBeenCalledTimes(1);
      expect(mockPuppeteerAgent).toHaveBeenCalledWith(pageMock);
    });

    test('should not switch page when tabIndex is out of range', async () => {
      const agent = new AgentProxy();
      const config: CdpConfig = {
        endpoint: 'ws://localhost:9222/devtools/browser/abc123',
        tabIndex: 10,
      };

      browserMock.pages.mockResolvedValue([pageMock]);

      await agent.connect(config);

      // Should still use the first page from connectToEndpoint
      expect(mockPuppeteerAgent).toHaveBeenCalledTimes(1);
      expect(mockPuppeteerAgent).toHaveBeenCalledWith(pageMock);
    });
  });

  describe('launch', () => {
    test('should launch browser with default config', async () => {
      const agent = new AgentProxy();
      const config: LaunchConfig = {};

      await agent.launch(config);

      expect(puppeteerMock.default.launch).toHaveBeenCalledWith({
        headless: true,
      });
      expect(browserMock.newPage).toHaveBeenCalled();
      expect(mockPuppeteerAgent).toHaveBeenCalledWith(pageMock);
    });

    test('should launch browser with headed mode', async () => {
      const agent = new AgentProxy();
      const config: LaunchConfig = { headed: true };

      await agent.launch(config);

      expect(puppeteerMock.default.launch).toHaveBeenCalledWith({
        headless: false,
      });
    });

    test('should set viewport', async () => {
      const agent = new AgentProxy();
      const config: LaunchConfig = {
        viewport: { width: 1024, height: 768 },
      };

      await agent.launch(config);

      expect(pageMock.setViewport).toHaveBeenCalledWith(config.viewport);
    });

    test('should navigate to URL', async () => {
      const agent = new AgentProxy();
      const config: LaunchConfig = {
        url: 'https://example.com',
      };

      await agent.launch(config);

      expect(pageMock.goto).toHaveBeenCalledWith(config.url, {
        waitUntil: 'domcontentloaded',
      });
    });

    test('should launch with all config options', async () => {
      const agent = new AgentProxy();
      const config: LaunchConfig = {
        headed: true,
        url: 'https://example.com',
        viewport: { width: 1920, height: 1080 },
      };

      await agent.launch(config);

      expect(puppeteerMock.default.launch).toHaveBeenCalledWith({
        headless: false,
      });
      expect(pageMock.setViewport).toHaveBeenCalledWith(config.viewport);
      expect(pageMock.goto).toHaveBeenCalledWith(config.url, {
        waitUntil: 'domcontentloaded',
      });
    });
  });

  describe('AI methods', () => {
    const connectAgent = async (agent: any) => {
      setupMockFetch('ws://localhost:9222/devtools/browser/abc123');
      await agent.connect();
    };

    test('should proxy aiAct calls', async () => {
      const agent = new AgentProxy();
      await connectAgent(agent);

      const result = await agent.aiAct('click button');

      expect(puppeteerAgentMock.aiAct).toHaveBeenCalledWith(
        'click button',
        undefined,
      );
      expect(result).toBe('aiAct result');
    });

    test('should proxy aiAct with options', async () => {
      const agent = new AgentProxy();
      await connectAgent(agent);
      const options = { timeout: 5000 };

      await agent.aiAct('click button', options);

      expect(puppeteerAgentMock.aiAct).toHaveBeenCalledWith(
        'click button',
        options,
      );
    });

    test('should proxy aiAction calls', async () => {
      const agent = new AgentProxy();
      await connectAgent(agent);

      const result = await agent.aiAction('type text');

      expect(puppeteerAgentMock.aiAction).toHaveBeenCalledWith(
        'type text',
        undefined,
      );
      expect(result).toBe('aiAction result');
    });

    test('should proxy aiQuery calls', async () => {
      const agent = new AgentProxy();
      await connectAgent(agent);

      const result = await agent.aiQuery('get text');

      expect(puppeteerAgentMock.aiQuery).toHaveBeenCalledWith(
        'get text',
        undefined,
      );
      expect(result).toBe('aiQuery result');
    });

    test('should proxy aiAssert calls', async () => {
      const agent = new AgentProxy();
      await connectAgent(agent);

      await agent.aiAssert('element exists');

      expect(puppeteerAgentMock.aiAssert).toHaveBeenCalledWith(
        'element exists',
        undefined,
      );
    });

    test('should proxy aiLocate calls', async () => {
      const agent = new AgentProxy();
      await connectAgent(agent);

      const result = await agent.aiLocate('find button');

      expect(puppeteerAgentMock.aiLocate).toHaveBeenCalledWith(
        'find button',
        undefined,
      );
      expect(result).toBe('aiLocate result');
    });

    test('should proxy aiWaitFor calls', async () => {
      const agent = new AgentProxy();
      await connectAgent(agent);

      await agent.aiWaitFor('element visible');

      expect(puppeteerAgentMock.aiWaitFor).toHaveBeenCalledWith(
        'element visible',
        undefined,
      );
    });

    test('should throw error if not connected', async () => {
      const agent = new AgentProxy();

      await expect(agent.aiAct('click button')).rejects.toThrow(
        'Please call agent.connect() or agent.launch() first to connect to a browser',
      );
    });

    test('should throw error for all AI methods if not connected', async () => {
      const agent = new AgentProxy();

      const errorMessage =
        'Please call agent.connect() or agent.launch() first to connect to a browser';

      await expect(agent.aiAction('action')).rejects.toThrow(errorMessage);
      await expect(agent.aiQuery('query')).rejects.toThrow(errorMessage);
      await expect(agent.aiAssert('assert')).rejects.toThrow(errorMessage);
      await expect(agent.aiLocate('locate')).rejects.toThrow(errorMessage);
      await expect(agent.aiWaitFor('wait')).rejects.toThrow(errorMessage);
    });
  });

  describe('destroy', () => {
    test('should destroy owned browser', async () => {
      const agent = new AgentProxy();
      await agent.launch({});

      await agent.destroy();

      expect(puppeteerAgentMock.destroy).toHaveBeenCalled();
      expect(browserMock.close).toHaveBeenCalled();
    });

    test('should disconnect non-owned browser', async () => {
      const agent = new AgentProxy();
      setupMockFetch('ws://localhost:9222/devtools/browser/abc123');
      await agent.connect();

      await agent.destroy();

      expect(puppeteerAgentMock.destroy).toHaveBeenCalled();
      expect(browserMock.disconnect).toHaveBeenCalled();
      expect(browserMock.close).not.toHaveBeenCalled();
    });

    test('should handle destroy when no browser exists', async () => {
      const agent = new AgentProxy();

      await expect(agent.destroy()).resolves.not.toThrow();
    });
  });

  describe('discoverLocal', () => {
    test('should throw error when cannot connect to Chrome', async () => {
      const agent = new AgentProxy();
      setupFailedFetch();

      await expect((agent as any).discoverLocal()).rejects.toThrow(
        'Cannot connect to local Chrome (port 9222).',
      );
    });

    test('should include startup instructions in error message', async () => {
      const agent = new AgentProxy();
      setupFailedFetch();

      await expect((agent as any).discoverLocal()).rejects.toThrow(
        '--remote-debugging-port=',
      );
    });
  });
});
