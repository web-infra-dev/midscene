import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock puppeteer
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn(),
    connect: vi.fn(),
  },
}));

// Mock @midscene/web/puppeteer
vi.mock('@midscene/web/puppeteer', () => ({
  PuppeteerAgent: vi.fn(),
}));

describe('agent-factory', () => {
  let puppeteerMock: any;
  let PuppeteerAgentMock: any;
  let browserMock: any;
  let pageMock: any;

  const setupMockFetch = (webSocketDebuggerUrl: string) => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ webSocketDebuggerUrl }),
    });
    vi.stubGlobal('fetch', mockFetch);
    return mockFetch;
  };

  const setupFailedFetch = () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', mockFetch);
    return mockFetch;
  };

  const setupNetworkErrorFetch = () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
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

    puppeteerMock = (await import('puppeteer')).default;
    puppeteerMock.launch.mockResolvedValue(browserMock);
    puppeteerMock.connect.mockResolvedValue(browserMock);

    PuppeteerAgentMock = (await import('@midscene/web/puppeteer'))
      .PuppeteerAgent;
    PuppeteerAgentMock.mockImplementation((page: any) => ({
      page,
      aiAct: vi.fn().mockResolvedValue('aiAct result'),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('launchAgent', () => {
    test('should launch browser with default config', async () => {
      const { launchAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );

      const agent = await launchAgent();

      expect(puppeteerMock.launch).toHaveBeenCalledWith({ headless: true });
      expect(browserMock.newPage).toHaveBeenCalled();
      expect(PuppeteerAgentMock).toHaveBeenCalledWith(pageMock);
      expect(agent).toBeDefined();
    });

    test('should launch browser with headed mode', async () => {
      const { launchAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );

      await launchAgent({ headed: true });

      expect(puppeteerMock.launch).toHaveBeenCalledWith({ headless: false });
    });

    test('should set viewport', async () => {
      const { launchAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      const viewport = { width: 1920, height: 1080 };

      await launchAgent({ viewport });

      expect(pageMock.setViewport).toHaveBeenCalledWith(viewport);
    });

    test('should navigate to URL', async () => {
      const { launchAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      const url = 'https://example.com';

      await launchAgent({ url });

      expect(pageMock.goto).toHaveBeenCalledWith(url, {
        waitUntil: 'domcontentloaded',
      });
    });

    test('should launch with all config options', async () => {
      const { launchAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      const config = {
        headed: true,
        url: 'https://example.com',
        viewport: { width: 1280, height: 720 },
      };

      await launchAgent(config);

      expect(puppeteerMock.launch).toHaveBeenCalledWith({ headless: false });
      expect(pageMock.setViewport).toHaveBeenCalledWith(config.viewport);
      expect(pageMock.goto).toHaveBeenCalledWith(config.url, {
        waitUntil: 'domcontentloaded',
      });
    });
  });

  describe('connectAgent', () => {
    test('should connect with auto discovery when no config provided', async () => {
      const { connectAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      setupMockFetch('ws://localhost:9222/devtools/browser/abc123');

      await connectAgent();

      expect(puppeteerMock.connect).toHaveBeenCalledWith({
        browserWSEndpoint: 'ws://localhost:9222/devtools/browser/abc123',
      });
    });

    test('should connect with string endpoint', async () => {
      const { connectAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      const endpoint = 'ws://localhost:9222/devtools/browser/abc123';

      await connectAgent(endpoint);

      expect(puppeteerMock.connect).toHaveBeenCalledWith({
        browserWSEndpoint: endpoint,
      });
    });

    test('should connect with object config', async () => {
      const { connectAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      const endpoint = 'wss://connect.browserbase.com';

      await connectAgent({ endpoint });

      expect(puppeteerMock.connect).toHaveBeenCalledWith({
        browserWSEndpoint: endpoint,
      });
    });

    test('should add apiKey to endpoint URL', async () => {
      const { connectAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );

      await connectAgent({
        endpoint: 'wss://connect.browserbase.com',
        apiKey: 'test-api-key',
      });

      expect(puppeteerMock.connect).toHaveBeenCalledWith({
        browserWSEndpoint: 'wss://connect.browserbase.com/?apiKey=test-api-key',
      });
    });

    test('should select tab by URL', async () => {
      const { connectAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      const targetPage = {
        url: vi.fn().mockReturnValue('https://target.com/page'),
      };
      const otherPage = { url: vi.fn().mockReturnValue('https://other.com') };
      browserMock.pages.mockResolvedValue([otherPage, targetPage]);

      await connectAgent({
        endpoint: 'ws://localhost:9222',
        tabUrl: 'target.com',
      });

      expect(PuppeteerAgentMock).toHaveBeenCalledWith(targetPage);
    });

    test('should select tab by index', async () => {
      const { connectAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      const page0 = { url: vi.fn().mockReturnValue('https://page0.com') };
      const page1 = { url: vi.fn().mockReturnValue('https://page1.com') };
      browserMock.pages.mockResolvedValue([page0, page1]);

      await connectAgent({
        endpoint: 'ws://localhost:9222',
        tabIndex: 1,
      });

      expect(PuppeteerAgentMock).toHaveBeenCalledWith(page1);
    });

    test('should throw error for invalid WebSocket URL', async () => {
      const { connectAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );

      await expect(connectAgent('http://invalid')).rejects.toThrow(
        'Invalid WebSocket endpoint URL',
      );
    });
  });

  describe('discoverLocal', () => {
    test('should throw error when cannot connect to Chrome', async () => {
      const { connectAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      setupFailedFetch();

      await expect(connectAgent()).rejects.toThrow(
        'Cannot connect to local Chrome (port 9222).',
      );
    });

    test('should throw error on network failure', async () => {
      const { connectAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      setupNetworkErrorFetch();

      await expect(connectAgent()).rejects.toThrow(
        'Cannot connect to local Chrome (port 9222).',
      );
    });

    test('should include startup instructions in error message', async () => {
      const { connectAgent } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      setupFailedFetch();

      await expect(connectAgent()).rejects.toThrow('--remote-debugging-port=');
    });
  });

  describe('cleanup', () => {
    test('should close owned browsers', async () => {
      const { launchAgent, cleanup } = await import(
        '../../../src/ts-runner/agent-factory'
      );

      await launchAgent();
      await cleanup();

      expect(browserMock.close).toHaveBeenCalled();
    });

    test('should disconnect non-owned browsers', async () => {
      const { connectAgent, cleanup } = await import(
        '../../../src/ts-runner/agent-factory'
      );
      setupMockFetch('ws://localhost:9222/devtools/browser/abc123');

      await connectAgent();
      await cleanup();

      expect(browserMock.disconnect).toHaveBeenCalled();
      expect(browserMock.close).not.toHaveBeenCalled();
    });
  });
});
