import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAddListener = vi.fn();
const mockRemoveListener = vi.fn();
const mockSendCommand = vi.fn();

vi.stubGlobal('chrome', {
  runtime: {
    getURL: vi.fn((path: string) => path),
  },
  tabs: {
    get: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
  },
  debugger: {
    attach: vi.fn(),
    detach: vi.fn(),
    sendCommand: mockSendCommand,
    onEvent: {
      addListener: mockAddListener,
      removeListener: mockRemoveListener,
    },
  },
});

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
}));

vi.mock('../../src/chrome-extension/dynamic-scripts', () => ({
  getHtmlElementScript: vi.fn(async () => ''),
  injectStopWaterFlowAnimation: vi.fn(async () => ''),
  injectWaterFlowAnimation: vi.fn(async () => ''),
}));

import ChromeExtensionProxyPage from '../../src/chrome-extension/page';

describe('ChromeExtensionProxyPage file chooser support', () => {
  let page: ChromeExtensionProxyPage;
  let nodeAttributes: string[] | undefined;

  const getFileChooserListener = () => {
    const listener = mockAddListener.mock.calls.at(-1)?.[0];
    expect(listener).toBeTypeOf('function');
    return listener as (
      source: chrome.debugger.Debuggee,
      method: string,
      params?: unknown,
    ) => Promise<void>;
  };

  const getInterceptFileChooserCalls = (enabled: boolean) =>
    mockSendCommand.mock.calls.filter(
      ([, method, params]) =>
        method === 'Page.setInterceptFileChooserDialog' &&
        (params as { enabled?: boolean }).enabled === enabled,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    nodeAttributes = [];
    page = new ChromeExtensionProxyPage(false);
    (page as any).activeTabId = 7;

    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 7,
      url: 'https://example.com',
      status: 'complete',
    } as chrome.tabs.Tab);

    mockSendCommand.mockImplementation(async (_target, method: string) => {
      if (method === 'DOM.describeNode') {
        return {
          node: {
            attributes: nodeAttributes,
          },
        };
      }

      if (method === 'Runtime.evaluate') {
        return { result: { value: true } };
      }

      return {};
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets accepted files when a file chooser opens', async () => {
    const files = ['/tmp/a.txt', '/tmp/b.txt'];
    nodeAttributes = ['type', 'file', 'multiple', ''];

    const registration = await page.registerFileChooserListener(
      async (chooser) => {
        await chooser.accept(files);
      },
    );

    const listener = getFileChooserListener();
    await listener({ tabId: 7 }, 'Page.fileChooserOpened', {
      backendNodeId: 42,
    });

    expect(mockSendCommand).toHaveBeenCalledWith(
      { tabId: 7 },
      'DOM.setFileInputFiles',
      {
        files,
        backendNodeId: 42,
      },
    );
    expect(registration.getError()).toBeUndefined();

    registration.dispose();
    expect(mockRemoveListener).toHaveBeenCalledWith(listener);
  });

  it('does not let stale dispose disable a newer registration', async () => {
    const firstRegistration = await page.registerFileChooserListener(
      async (chooser) => {
        await chooser.accept(['/tmp/first.txt']);
      },
    );
    const firstListener = getFileChooserListener();

    firstRegistration.dispose();

    await page.registerFileChooserListener(async (chooser) => {
      await chooser.accept(['/tmp/second.txt']);
    });
    await Promise.resolve();

    expect(mockRemoveListener).toHaveBeenCalledWith(firstListener);
    expect(getInterceptFileChooserCalls(true)).toHaveLength(2);
    expect(getInterceptFileChooserCalls(false)).toHaveLength(0);
  });

  it('captures an error when multiple files target a single-file input', async () => {
    const registration = await page.registerFileChooserListener(
      async (chooser) => {
        await chooser.accept(['/tmp/a.txt', '/tmp/b.txt']);
      },
    );

    const listener = getFileChooserListener();
    await listener({ tabId: 7 }, 'Page.fileChooserOpened', {
      backendNodeId: 42,
    });

    expect(registration.getError()?.message).toBe(
      'Non-multiple file input can only accept single file',
    );
    expect(mockSendCommand).not.toHaveBeenCalledWith(
      { tabId: 7 },
      'DOM.setFileInputFiles',
      expect.anything(),
    );
  });

  it('captures an error for directory upload inputs', async () => {
    nodeAttributes = ['type', 'file', 'webkitdirectory', ''];

    await page.registerFileChooserAccept(['/tmp/upload-dir']);
    const listener = getFileChooserListener();
    await listener({ tabId: 7 }, 'Page.fileChooserOpened', {
      backendNodeId: 42,
    });

    expect(page.getFileChooserError()?.message).toContain(
      'Directory upload (webkitdirectory) is not supported in Chrome extension bridge mode',
    );
  });
});
