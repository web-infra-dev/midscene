import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebMidsceneTools } from '@/agent-tools';
import { WebCdpMidsceneTools } from '@/agent-tools-cdp';
import {
  type PuppeteerPersistenceOptions,
  WebPuppeteerMidsceneTools,
} from '@/agent-tools-puppeteer';
import { AgentOverChromeBridge } from '@/bridge-mode';
import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const validPngBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const mockPage = {
  url: vi.fn(() => 'https://example.com/'),
  bringToFront: vi.fn(),
  goto: vi.fn(),
  setExtraHTTPHeaders: vi.fn(),
  setViewport: vi.fn(),
  target: vi.fn((): { _targetId?: string } => ({ _targetId: 'target-1' })),
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
  persistence: PuppeteerPersistenceOptions & { targetIdFile: string };
} {
  const root = join(
    tmpdir(),
    `midscene-web-agent-init-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(root, { recursive: true });
  const persistence = {
    endpointFile: join(root, 'endpoint'),
    userDataDir: join(root, 'profile'),
    targetIdFile: join(root, 'target-id'),
  };
  writeFileSync(persistence.endpointFile, 'ws://127.0.0.1:9222/devtools/1');
  return { root, persistence };
}

async function rejectedError(promise: Promise<unknown>): Promise<Error> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(Error);
  return error as Error;
}

type WebInitArgTestFactory = () => {
  tools: WebMidsceneTools | WebPuppeteerMidsceneTools | WebCdpMidsceneTools;
  cleanup?: () => void;
};

describe('web agent tool init args', () => {
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

  it('reuses the saved Puppeteer target when browser.pages returns newer tabs first', async () => {
    const { root, persistence } = createPersistenceRoot();
    const newerPage = {
      ...mockPage,
      url: vi.fn(() => 'https://bbb.example.com/'),
      target: vi.fn(() => ({ _targetId: 'target-bbb' })),
    };
    const olderPage = {
      ...mockPage,
      url: vi.fn(() => 'https://aaa.example.com/'),
      target: vi.fn(() => ({ _targetId: 'target-aaa' })),
    };

    try {
      writeFileSync(persistence.targetIdFile, 'target-bbb');
      mockBrowser.pages.mockResolvedValueOnce([newerPage, olderPage]);

      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();

      const takeScreenshotTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'take_screenshot');
      await takeScreenshotTool?.handler({});

      expect(PuppeteerAgent).toHaveBeenLastCalledWith(
        newerPage,
        expect.any(Object),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails instead of guessing a Puppeteer tab when the saved target cannot be read', async () => {
    const { root, persistence } = createPersistenceRoot();

    try {
      mkdirSync(persistence.targetIdFile);
      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();
      const connectTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_connect');

      const error = await rejectedError(connectTool!.handler({}));

      expect(error.message).toContain(
        `Failed to read Puppeteer targetId from "${persistence.targetIdFile}"`,
      );
      expect(error.cause).toBeInstanceOf(Error);
      expect(PuppeteerAgent).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails the current command when the Puppeteer target cannot be saved', async () => {
    const { root, persistence } = createPersistenceRoot();

    try {
      mkdirSync(persistence.targetIdFile);
      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();
      const connectTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_connect');

      const error = await rejectedError(
        connectTool!.handler({ web: { url: 'https://bbb.example.com' } }),
      );

      expect(error.message).toContain(
        `Failed to save Puppeteer targetId to "${persistence.targetIdFile}"`,
      );
      expect(error.cause).toBeInstanceOf(Error);
      expect(PuppeteerAgent).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects an empty Puppeteer target file as corrupt state', async () => {
    const { root, persistence } = createPersistenceRoot();

    try {
      writeFileSync(persistence.targetIdFile, ' \n');
      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();
      const connectTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_connect');

      await expect(connectTool!.handler({})).rejects.toThrow(
        `Puppeteer targetId file "${persistence.targetIdFile}" is empty`,
      );
      expect(PuppeteerAgent).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the existing page when no Puppeteer target has been saved yet', async () => {
    const { root, persistence } = createPersistenceRoot();

    try {
      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();
      const takeScreenshotTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'take_screenshot');

      await takeScreenshotTool!.handler({});

      expect(PuppeteerAgent).toHaveBeenCalledWith(mockPage, expect.any(Object));
      expect(readFileSync(persistence.targetIdFile, 'utf-8')).toBe('target-1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when Puppeteer does not expose a target ID for the selected page', async () => {
    const { root, persistence } = createPersistenceRoot();
    const pageWithoutTargetId = {
      ...mockPage,
      target: vi.fn(() => ({})),
    };

    try {
      mockBrowser.pages.mockResolvedValueOnce([pageWithoutTargetId]);
      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();
      const connectTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_connect');

      await expect(connectTool!.handler({})).rejects.toThrow(
        'Puppeteer did not expose a Chrome targetId',
      );
      expect(PuppeteerAgent).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('persists the connected Puppeteer target and clears it on disconnect and close', async () => {
    const { root, persistence } = createPersistenceRoot();

    try {
      const tools = new WebPuppeteerMidsceneTools(undefined, { persistence });
      await tools.initTools();
      const connectTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_connect');
      const disconnectTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_disconnect');
      const closeTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_close');

      await connectTool?.handler({ web: { url: 'https://bbb.example.com' } });
      expect(readFileSync(persistence.targetIdFile, 'utf-8')).toBe('target-1');

      await disconnectTool?.handler({});
      expect(existsSync(persistence.targetIdFile)).toBe(false);

      writeFileSync(persistence.targetIdFile, 'target-1');
      await closeTool?.handler({});
      expect(existsSync(persistence.targetIdFile)).toBe(false);
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

  it('exposes extra HTTP headers only in CDP mode', async () => {
    const bridgeTools = new WebMidsceneTools();
    const puppeteerTools = new WebPuppeteerMidsceneTools();
    const cdpTools = new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1');

    await Promise.all([
      bridgeTools.initTools(),
      puppeteerTools.initTools(),
      cdpTools.initTools(),
    ]);

    const getConnectSchema = (
      tools: WebMidsceneTools | WebPuppeteerMidsceneTools | WebCdpMidsceneTools,
    ) =>
      tools.getToolDefinitions().find((tool) => tool.name === 'web_connect')
        ?.schema;

    expect(getConnectSchema(bridgeTools)?.['web.extraHTTPHeaders']).toBe(
      undefined,
    );
    expect(getConnectSchema(puppeteerTools)?.['web.extraHTTPHeaders']).toBe(
      undefined,
    );
    expect(getConnectSchema(cdpTools)?.['web.extraHTTPHeaders']).toBeDefined();
    expect(
      cdpTools.getToolDefinitions().find((tool) => tool.name === 'web_connect')
        ?.cli?.options?.['web.extraHTTPHeaders']?.preferredName,
    ).toBe('extra-http-headers');
  });

  it('applies CDP extra HTTP headers before navigating', async () => {
    const tools = new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1');
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'web_connect');
    const headers = {
      'x-use-ppe': '1',
      'x-tt-env': 'ppe_example',
    };

    await connectTool?.handler({
      url: 'https://example.com',
      extraHTTPHeaders: headers,
    });

    expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith(headers);
    expect(
      mockPage.setExtraHTTPHeaders.mock.invocationCallOrder[0],
    ).toBeLessThan(mockPage.goto.mock.invocationCallOrder[0]);
  });

  it('does not apply CDP extra HTTP headers when omitted', async () => {
    const tools = new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1');
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'web_connect');

    await connectTool?.handler({ url: 'https://example.com' });

    expect(mockPage.setExtraHTTPHeaders).not.toHaveBeenCalled();
  });

  it('rejects non-string CDP extra HTTP header values', async () => {
    const tools = new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1');
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'web_connect');
    const headerSchema = connectTool?.schema['web.extraHTTPHeaders'];

    expect(headerSchema?.safeParse({ 'x-use-ppe': 1 }).success).toBe(false);
  });
});
