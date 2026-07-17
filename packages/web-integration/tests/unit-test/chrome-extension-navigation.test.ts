import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const onUpdatedListeners = new Set<(...args: any[]) => void>();

vi.stubGlobal('chrome', {
  tabs: {
    get: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    onUpdated: {
      addListener: vi.fn((listener) => onUpdatedListeners.add(listener)),
      removeListener: vi.fn((listener) => onUpdatedListeners.delete(listener)),
    },
  },
  debugger: {
    attach: vi.fn(),
    detach: vi.fn(),
    sendCommand: vi.fn(),
  },
});

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
}));

import ChromeExtensionProxyPage from '../../src/chrome-extension/page';

describe('ChromeExtensionProxyPage navigation', () => {
  let page: ChromeExtensionProxyPage;

  beforeEach(() => {
    vi.clearAllMocks();
    onUpdatedListeners.clear();
    page = new ChromeExtensionProxyPage(true);
    (page as any).activeTabId = 101;
    vi.spyOn(page as any, 'enableWaterFlowAnimation').mockResolvedValue(
      undefined,
    );
    (chrome.tabs.update as any).mockResolvedValue({
      id: 101,
      status: 'complete',
      url: 'https://www.bing.com',
    });
    (chrome.tabs.get as any).mockResolvedValue({
      id: 101,
      status: 'complete',
      url: 'https://bing.com/',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for the tab target to settle before probing document readiness', async () => {
    (chrome.debugger.sendCommand as any).mockResolvedValue({
      result: { value: 'complete' },
    });

    await page.navigate('https://www.bing.com');

    expect(chrome.tabs.update).toHaveBeenCalledWith(101, {
      url: 'https://www.bing.com',
    });
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 101 },
      'Runtime.evaluate',
      { expression: 'document.readyState' },
    );
  });

  it('recovers from an opaque debugger error while waiting for navigation', async () => {
    vi.spyOn(page as any, 'ensureDebuggerAttached').mockResolvedValue(
      undefined,
    );
    (chrome.debugger.sendCommand as any)
      .mockRejectedValueOnce({})
      .mockResolvedValueOnce({ result: { value: 'complete' } });

    await page.navigate('https://www.bing.com');

    expect((page as any).ensureDebuggerAttached).toHaveBeenCalledTimes(1);
    expect(chrome.debugger.sendCommand).toHaveBeenCalledTimes(2);
  });

  it('does not treat the previous complete HTTPS page as navigation completion', async () => {
    (chrome.tabs.update as any).mockResolvedValue({
      id: 101,
      pendingUrl: 'https://www.bing.com',
      status: 'loading',
      url: 'https://bing.com/',
    });
    (chrome.tabs.get as any).mockResolvedValue({
      id: 101,
      status: 'complete',
      url: 'https://bing.com/',
    });
    (chrome.debugger.sendCommand as any).mockResolvedValue({
      result: { value: 'complete' },
    });

    const navigation = page.navigate('https://www.bing.com');
    await Promise.resolve();
    await Promise.resolve();

    expect(chrome.debugger.sendCommand).not.toHaveBeenCalled();

    for (const listener of onUpdatedListeners) {
      listener(
        101,
        { status: 'complete' },
        {
          id: 101,
          status: 'complete',
          url: 'https://www.bing.com/redirected',
        },
      );
    }

    await navigation;
    expect(chrome.debugger.sendCommand).toHaveBeenCalled();
  });
});
