import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentOverChromeBridge } from '@/bridge-mode';
import { WebMidsceneTools } from '@/mcp-tools';
import { WebCdpMidsceneTools } from '@/mcp-tools-cdp';
import {
  type PuppeteerPersistenceOptions,
  WebPuppeteerMidsceneTools,
} from '@/mcp-tools-puppeteer';
import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validPngBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const mockPage = {
  url: vi.fn(() => 'https://example.com/'),
  bringToFront: vi.fn(),
  goto: vi.fn(),
  setViewport: vi.fn(),
  target: vi.fn(() => ({ _targetId: 'target-1' })),
};

const mockBrowser = {
  pages: vi.fn(async () => [mockPage]),
  newPage: vi.fn(async () => mockPage),
  disconnect: vi.fn(),
  close: vi.fn(),
};

vi.mock('puppeteer-core', () => ({
  default: {
    connect: vi.fn(async () => mockBrowser),
  },
}));

vi.mock('@/bridge-mode', () => ({
  AgentOverChromeBridge: vi.fn().mockImplementation(() => ({
    connectCurrentTab: vi.fn(),
    connectNewTabWithUrl: vi.fn(),
    page: {
      screenshotBase64: vi.fn(async () => validPngBase64),
    },
    destroy: vi.fn(),
  })),
}));

vi.mock('@/puppeteer', () => ({
  PuppeteerAgent: vi.fn().mockImplementation(() => ({
    page: {
      screenshotBase64: vi.fn(async () => validPngBase64),
    },
    destroy: vi.fn(),
  })),
}));

vi.mock('@/cdp-proxy-manager', () => ({
  getProxyEndpoint: vi.fn(async () => 'ws://127.0.0.1:9222/devtools/browser/1'),
}));

vi.mock('@/cdp-target-store', () => ({
  cleanupTargetIdFile: vi.fn(),
  readSavedTargetId: vi.fn(() => undefined),
  saveTargetId: vi.fn(),
}));

function createPersistenceRoot(): {
  root: string;
  persistence: Required<PuppeteerPersistenceOptions>;
} {
  const root = join(
    tmpdir(),
    `midscene-web-agent-init-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(root, { recursive: true });
  const persistence = {
    endpointFile: join(root, 'endpoint'),
    userDataDir: join(root, 'profile'),
  };
  writeFileSync(persistence.endpointFile, 'ws://127.0.0.1:9222/devtools/1');
  return { root, persistence };
}

type WebInitArgTestFactory = () => {
  tools: WebMidsceneTools | WebPuppeteerMidsceneTools | WebCdpMidsceneTools;
  cleanup?: () => void;
};

describe('web MCP agent init args', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockPage.url.mockReturnValue('https://example.com/');
  });

  it.each<[string, WebInitArgTestFactory]>([
    [
      'bridge',
      () => ({
        tools: new WebMidsceneTools(),
      }),
    ],
    [
      'puppeteer',
      () => {
        const { root, persistence } = createPersistenceRoot();
        return {
          tools: new WebPuppeteerMidsceneTools(undefined, { persistence }),
          cleanup: () => rmSync(root, { recursive: true, force: true }),
        };
      },
    ],
    [
      'cdp',
      () => ({
        tools: new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1'),
      }),
    ],
  ] as const)(
    'exposes common web init args in %s mode',
    async (_mode, create) => {
      const { tools, cleanup } = create();

      try {
        await tools.initTools();

        const takeScreenshotTool = tools
          .getToolDefinitions()
          .find((tool) => tool.name === 'take_screenshot');
        const connectTool = tools
          .getToolDefinitions()
          .find((tool) => tool.name === 'web_connect');

        expect(takeScreenshotTool?.schema).toEqual(
          expect.objectContaining({
            'web.url': expect.anything(),
            'web.waitAfterAction': expect.anything(),
            'web.replanningCycleLimit': expect.anything(),
            'web.screenshotShrinkFactor': expect.anything(),
          }),
        );
        expect(connectTool?.schema).toEqual(
          expect.objectContaining({
            'web.url': expect.anything(),
            'web.waitAfterAction': expect.anything(),
          }),
        );
      } finally {
        cleanup?.();
      }
    },
  );

  it('passes common behavior args to bridge agent creation', async () => {
    const tools = new WebMidsceneTools();
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'web_connect');

    await connectTool?.handler({
      url: 'https://example.com',
      waitAfterAction: 650,
      replanningCycleLimit: 12,
      aiActContext: 'accept permission dialogs',
      screenshotShrinkFactor: 2,
    });

    expect(AgentOverChromeBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        closeConflictServer: true,
        waitAfterAction: 650,
        replanningCycleLimit: 12,
        aiActContext: 'accept permission dialogs',
        screenshotShrinkFactor: 2,
      }),
    );
    expect(
      vi.mocked(AgentOverChromeBridge).mock.results[0].value
        .connectNewTabWithUrl,
    ).toHaveBeenCalledWith('https://example.com');
  });

  it('passes common behavior args to Puppeteer agent creation', async () => {
    const { root, persistence } = createPersistenceRoot();
    try {
      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();

      const takeScreenshotTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'take_screenshot');

      await takeScreenshotTool?.handler({
        web: {
          waitAfterAction: 650,
          replanningCycleLimit: 12,
          aiActContext: 'accept permission dialogs',
          screenshotShrinkFactor: 2,
        },
      });

      expect(PuppeteerAgent).toHaveBeenCalledWith(
        mockPage,
        expect.objectContaining({
          waitAfterAction: 650,
          replanningCycleLimit: 12,
          aiActContext: 'accept permission dialogs',
          screenshotShrinkFactor: 2,
        }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reuses the Puppeteer agent for identical init args and rebuilds when they change', async () => {
    const { root, persistence } = createPersistenceRoot();
    try {
      const firstAgent = {
        page: {
          screenshotBase64: vi.fn(async () => validPngBase64),
        },
        destroy: vi.fn(),
      };
      const secondAgent = {
        page: {
          screenshotBase64: vi.fn(async () => validPngBase64),
        },
        destroy: vi.fn(),
      };
      vi.mocked(PuppeteerAgent)
        .mockReturnValueOnce(firstAgent as any)
        .mockReturnValueOnce(secondAgent as any);

      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();

      const takeScreenshotTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'take_screenshot');

      await takeScreenshotTool?.handler({
        web: { waitAfterAction: 650 },
      });
      await takeScreenshotTool?.handler({
        web: { waitAfterAction: 650 },
      });
      await takeScreenshotTool?.handler({
        web: { waitAfterAction: 900 },
      });

      expect(PuppeteerAgent).toHaveBeenCalledTimes(2);
      expect(firstAgent.destroy).toHaveBeenCalledTimes(1);
      expect(PuppeteerAgent).toHaveBeenLastCalledWith(
        mockPage,
        expect.objectContaining({
          waitAfterAction: 900,
        }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rebuilds the Puppeteer agent without behavior args when they are omitted after being set', async () => {
    const { root, persistence } = createPersistenceRoot();
    try {
      const firstAgent = {
        page: {
          screenshotBase64: vi.fn(async () => validPngBase64),
        },
        destroy: vi.fn(),
      };
      const secondAgent = {
        page: {
          screenshotBase64: vi.fn(async () => validPngBase64),
        },
        destroy: vi.fn(),
      };
      vi.mocked(PuppeteerAgent)
        .mockReturnValueOnce(firstAgent as any)
        .mockReturnValueOnce(secondAgent as any);

      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();

      const takeScreenshotTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'take_screenshot');

      await takeScreenshotTool?.handler({
        web: { waitAfterAction: 650 },
      });
      await takeScreenshotTool?.handler({});

      expect(PuppeteerAgent).toHaveBeenCalledTimes(2);
      expect(firstAgent.destroy).toHaveBeenCalledTimes(1);
      const lastAgentOptions = vi.mocked(PuppeteerAgent).mock.calls.at(-1)?.[1];
      expect(lastAgentOptions).not.toHaveProperty('waitAfterAction');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each<[string, WebInitArgTestFactory, () => void]>([
    [
      'bridge',
      () => ({
        tools: new WebMidsceneTools(),
      }),
      () => {
        expect(AgentOverChromeBridge).toHaveBeenCalledTimes(2);
        const openUrlCallCount = vi
          .mocked(AgentOverChromeBridge)
          .mock.results.map((result) => result.value.connectNewTabWithUrl)
          .reduce(
            (count, connectNewTabWithUrl) =>
              count + connectNewTabWithUrl.mock.calls.length,
            0,
          );
        expect(openUrlCallCount).toBe(2);
      },
    ],
    [
      'puppeteer',
      () => {
        const { root, persistence } = createPersistenceRoot();
        return {
          tools: new WebPuppeteerMidsceneTools(undefined, { persistence }),
          cleanup: () => rmSync(root, { recursive: true, force: true }),
        };
      },
      () => {
        expect(PuppeteerAgent).toHaveBeenCalledTimes(2);
        expect(mockBrowser.newPage).toHaveBeenCalledTimes(2);
        expect(mockPage.goto).toHaveBeenCalledTimes(2);
      },
    ],
    [
      'cdp',
      () => ({
        tools: new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1'),
      }),
      () => {
        expect(PuppeteerAgent).toHaveBeenCalledTimes(2);
        expect(mockPage.goto).toHaveBeenCalledTimes(2);
      },
    ],
  ] as const)(
    'reopens or renavigates when the same web.url is passed twice in %s mode',
    async (_mode, create, assertReopened) => {
      const { tools, cleanup } = create();

      try {
        await tools.initTools();

        const takeScreenshotTool = tools
          .getToolDefinitions()
          .find((tool) => tool.name === 'take_screenshot');

        await takeScreenshotTool?.handler({
          web: { url: 'https://example.com' },
        });
        await takeScreenshotTool?.handler({
          web: { url: 'https://example.com' },
        });

        assertReopened();
      } finally {
        cleanup?.();
      }
    },
  );

  it('passes common behavior args to CDP agent creation', async () => {
    const tools = new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1');
    await tools.initTools();

    const takeScreenshotTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'take_screenshot');

    await takeScreenshotTool?.handler({
      web: {
        waitAfterAction: 650,
        replanningCycleLimit: 12,
        aiActContext: 'accept permission dialogs',
        screenshotShrinkFactor: 2,
      },
    });

    expect(PuppeteerAgent).toHaveBeenCalledWith(
      mockPage,
      expect.objectContaining({
        waitAfterAction: 650,
        replanningCycleLimit: 12,
        aiActContext: 'accept permission dialogs',
        screenshotShrinkFactor: 2,
      }),
    );
  });
});
