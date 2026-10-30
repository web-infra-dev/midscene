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
import { saveTargetId } from '@/cdp-target-store';
import { PuppeteerBrowserAgent } from '@/puppeteer';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

const validPngBase64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const mockPage = {
  url: rs.fn(() => 'https://example.com/'),
  title: rs.fn(async () => 'Example'),
  isClosed: rs.fn(() => false),
  bringToFront: rs.fn(),
  goto: rs.fn(),
  setExtraHTTPHeaders: rs.fn(),
  setViewport: rs.fn(),
  target: rs.fn((): { _targetId?: string } => ({ _targetId: 'target-1' })),
};

const mockBrowser = {
  pages: rs.fn(async () => [mockPage]),
  newPage: rs.fn(async () => mockPage),
  disconnect: rs.fn(),
  close: rs.fn(),
};

rs.mock('puppeteer-core', () => ({
  default: {
    connect: rs.fn(async () => mockBrowser),
  },
}));

rs.mock('@/bridge-mode', () => ({
  AgentOverChromeBridge: rs.fn().mockImplementation(() => ({
    connectCurrentTab: rs.fn(),
    getBrowserTabList: rs.fn(async () => [
      {
        id: '42',
        title: 'Example',
        url: 'https://example.com/',
        currentActiveTab: true,
      },
    ]),
    connectNewTabWithUrl: rs.fn(),
    page: {
      screenshotBase64: rs.fn(async () => validPngBase64),
      getActiveTabId: rs.fn(async () => 42),
    },
    destroy: rs.fn(),
  })),
}));

rs.mock('@/puppeteer', () => ({
  PuppeteerBrowserAgent: rs.fn().mockImplementation(() => ({
    activePage: mockPage,
    pages: () => mockBrowser.pages(),
    setActivePage: rs.fn(),
    page: {
      screenshotBase64: rs.fn(async () => validPngBase64),
      getActiveTabId: rs.fn(async () => 42),
    },
    destroy: rs.fn(),
  })),
}));

rs.mock('@/cdp-proxy-manager', () => ({
  getProxyEndpoint: rs.fn(async () => 'ws://127.0.0.1:9222/devtools/browser/1'),
}));

rs.mock('@/cdp-target-store', () => ({
  cleanupTargetIdFile: rs.fn(),
  readSavedTargetId: rs.fn(() => undefined),
  saveTargetId: rs.fn(),
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
    rs.clearAllMocks();
  });

  afterEach(() => {
    mockPage.url.mockReturnValue('https://example.com/');
  });

  it('lists and switches CDP tabs using the shared browser agent and target store', async () => {
    const tools = new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1');
    await tools.initTools();
    const tabs = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'web_tabs')!;
    const select = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'web_switch-tab')!;
    const result = await tabs.handler({});
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual([
      {
        id: 'target-1',
        title: 'Example',
        url: 'https://example.com/',
        active: true,
      },
    ]);
    await select.handler({ id: 'target-1' });
    expect(saveTargetId).toHaveBeenLastCalledWith('target-1');
    expect(
      rs.mocked(PuppeteerBrowserAgent).mock.results[0].value.setActivePage,
    ).toHaveBeenCalledWith(mockPage);
    await expect(select.handler({ id: 'missing' })).rejects.toThrow(
      'does not exist or has closed',
    );
    await tools.destroy();
  });

  it.each(['connect', 'readback', 'mismatch'] as const)(
    'cleans up a new Bridge agent when tab reconnection fails at %s',
    async (failurePoint) => {
      const tools = new WebMidsceneTools();
      await tools.initTools();
      const tabs = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_tabs')!;
      await tabs.handler({});
      const failure = new Error('bridge failure');
      const replacement = {
        connectCurrentTab: rs.fn(async () => {
          if (failurePoint === 'connect') throw failure;
        }),
        page: {
          getActiveTabId: rs.fn(async () => {
            if (failurePoint === 'readback') throw failure;
            return 99;
          }),
        },
        destroy: rs.fn(async () => {}),
      };
      rs.mocked(AgentOverChromeBridge).mockImplementationOnce(
        () => replacement as unknown as AgentOverChromeBridge,
      );
      const select = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_switch-tab')!;
      await expect(select.handler({ id: '42' })).rejects.toThrow(
        failurePoint === 'mismatch' ? 'did not switch tabs' : 'bridge failure',
      );
      expect(replacement.destroy).toHaveBeenCalledTimes(1);
      await tools.destroy();
    },
  );

  it('switches Bridge tabs by reconnecting to an existing ID without navigating', async () => {
    const tools = new WebMidsceneTools();
    await tools.initTools();
    const select = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'web_switch-tab')!;
    await expect(select.handler({ id: '42oops' })).rejects.toThrow(
      'Invalid Bridge tab ID',
    );
    await expect(select.handler({ id: '99' })).rejects.toThrow(
      'does not exist or has closed',
    );
    await select.handler({ id: '42' });
    const agents = rs
      .mocked(AgentOverChromeBridge)
      .mock.results.map((result) => result.value);
    expect(agents[0].destroy).toHaveBeenCalledTimes(1);
    expect(agents[1].connectCurrentTab).toHaveBeenCalledWith({
      tabId: 42,
      forceSameTabNavigation: false,
    });
    expect(agents[1].connectNewTabWithUrl).not.toHaveBeenCalled();
    await tools.destroy();
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
      rs.mocked(AgentOverChromeBridge).mock.results[0].value
        .connectNewTabWithUrl,
    ).toHaveBeenCalledWith('https://example.com', {
      forceSameTabNavigation: false,
    });
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

      expect(PuppeteerBrowserAgent).toHaveBeenCalledWith(
        mockBrowser,
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
      url: rs.fn(() => 'https://bbb.example.com/'),
      target: rs.fn(() => ({ _targetId: 'target-bbb' })),
    };
    const olderPage = {
      ...mockPage,
      url: rs.fn(() => 'https://aaa.example.com/'),
      target: rs.fn(() => ({ _targetId: 'target-aaa' })),
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

      expect(PuppeteerBrowserAgent).toHaveBeenLastCalledWith(
        mockBrowser,
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
      expect(PuppeteerBrowserAgent).not.toHaveBeenCalled();
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
      expect(PuppeteerBrowserAgent).not.toHaveBeenCalled();
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
      expect(PuppeteerBrowserAgent).not.toHaveBeenCalled();
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

      expect(PuppeteerBrowserAgent).toHaveBeenCalledWith(
        mockBrowser,
        mockPage,
        expect.any(Object),
      );
      expect(readFileSync(persistence.targetIdFile, 'utf-8')).toBe('target-1');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when Puppeteer does not expose a target ID for the selected page', async () => {
    const { root, persistence } = createPersistenceRoot();
    const pageWithoutTargetId = {
      ...mockPage,
      target: rs.fn(() => ({})),
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
      expect(PuppeteerBrowserAgent).not.toHaveBeenCalled();
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
          screenshotBase64: rs.fn(async () => validPngBase64),
          getActiveTabId: rs.fn(async () => 42),
        },
        destroy: rs.fn(),
      };
      const secondAgent = {
        page: {
          screenshotBase64: rs.fn(async () => validPngBase64),
          getActiveTabId: rs.fn(async () => 42),
        },
        destroy: rs.fn(),
      };
      rs.mocked(PuppeteerBrowserAgent)
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

      expect(PuppeteerBrowserAgent).toHaveBeenCalledTimes(2);
      expect(firstAgent.destroy).toHaveBeenCalledTimes(1);
      expect(PuppeteerBrowserAgent).toHaveBeenLastCalledWith(
        mockBrowser,
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
          screenshotBase64: rs.fn(async () => validPngBase64),
          getActiveTabId: rs.fn(async () => 42),
        },
        destroy: rs.fn(),
      };
      const secondAgent = {
        page: {
          screenshotBase64: rs.fn(async () => validPngBase64),
          getActiveTabId: rs.fn(async () => 42),
        },
        destroy: rs.fn(),
      };
      rs.mocked(PuppeteerBrowserAgent)
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

      expect(PuppeteerBrowserAgent).toHaveBeenCalledTimes(2);
      expect(firstAgent.destroy).toHaveBeenCalledTimes(1);
      const lastAgentOptions = rs
        .mocked(PuppeteerBrowserAgent)
        .mock.calls.at(-1)?.[2];
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
        const openUrlCallCount = rs
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
        expect(PuppeteerBrowserAgent).toHaveBeenCalledTimes(2);
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
        expect(PuppeteerBrowserAgent).toHaveBeenCalledTimes(2);
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

    expect(PuppeteerBrowserAgent).toHaveBeenCalledWith(
      mockBrowser,
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

    expect(getConnectSchema(bridgeTools)?.['web.extraHttpHeader']).toBe(
      undefined,
    );
    expect(getConnectSchema(puppeteerTools)?.['web.extraHttpHeader']).toBe(
      undefined,
    );
    expect(getConnectSchema(cdpTools)?.['web.extraHttpHeader']).toBeDefined();
    expect(
      cdpTools.getToolDefinitions().find((tool) => tool.name === 'web_connect')
        ?.cli?.options?.['web.extraHttpHeader']?.preferredName,
    ).toBe('extra-http-header');
  });

  it('combines repeated CDP extra HTTP headers before navigating', async () => {
    const tools = new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1');
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'web_connect');
    await connectTool?.handler({
      url: 'https://example.com',
      extraHttpHeader: [
        'x-use-ppe:1',
        'x-tt-env:ppe_example',
        'x-callback-url:https://example.com/callback',
      ],
    });

    expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith({
      'x-use-ppe': '1',
      'x-tt-env': 'ppe_example',
      'x-callback-url': 'https://example.com/callback',
    });
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

  it('accepts one CDP extra HTTP header without an array', async () => {
    const tools = new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1');
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'web_connect');

    await connectTool?.handler({
      url: 'https://example.com',
      extraHttpHeader: 'x-use-ppe:1',
    });

    expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith({
      'x-use-ppe': '1',
    });
  });

  it.each(['missing-colon', ':missing-name', 'invalid name:value'])(
    'rejects invalid CDP extra HTTP header entry %s',
    async (entry) => {
      const tools = new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1');
      await tools.initTools();

      const connectTool = tools
        .getToolDefinitions()
        .find((tool) => tool.name === 'web_connect');
      const headerSchema = connectTool?.schema['web.extraHttpHeader'];

      expect(headerSchema?.safeParse(entry).success).toBe(false);
    },
  );

  it('rejects an empty CDP extra HTTP header array', async () => {
    const tools = new WebCdpMidsceneTools('ws://127.0.0.1:9222/devtools/1');
    await tools.initTools();

    const connectTool = tools
      .getToolDefinitions()
      .find((tool) => tool.name === 'web_connect');
    const headerSchema = connectTool?.schema['web.extraHttpHeader'];

    expect(headerSchema?.safeParse([]).success).toBe(false);
  });
});
