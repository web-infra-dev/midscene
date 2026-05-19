import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock chrome API
vi.stubGlobal('chrome', {
  tabs: {
    update: vi.fn(),
    get: vi.fn(),
    query: vi.fn(),
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

describe('debugger detach race during lazy attach', () => {
  let page: ChromeExtensionProxyPage;

  beforeEach(() => {
    vi.clearAllMocks();
    page = new ChromeExtensionProxyPage(true);
    // Simulate that connectNewTabWithUrl already set the active tab
    // and waited for navigation to finish; the tab is now stable.
    (page as any).activeTabId = 1302238007;

    (chrome.tabs.get as any).mockResolvedValue({
      id: 1302238007,
      url: 'https://example.com',
      status: 'complete',
    });
    // attach always succeeds in this scenario.
    (chrome.debugger.attach as any).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('size() succeeds even if enableWaterFlowAnimation transiently fails after attach', async () => {
    // Reproduces the user's failure mode:
    //   1. First sendCommand for size's Runtime.evaluate fails — debugger not attached yet.
    //   2. sendCommandToDebugger catches the detach error and calls ensureDebuggerAttached.
    //   3. chrome.debugger.attach succeeds.
    //   4. ensureDebuggerAttached awaits enableWaterFlowAnimation, whose
    //      chrome.debugger.sendCommand call fails because Chrome briefly
    //      detached the debugger (cross-origin navigation, devtools race, etc.).
    //   5. Before the fix, that water-flow failure propagates out of the
    //      try/catch in sendCommandToDebugger (we're already inside catch),
    //      so the retry of the original "size" command never runs and the
    //      user sees "Debugger is not attached to the tab with id: ...".
    //
    // The expected behavior after fixing the race is that
    //   - water-flow failures inside ensureDebuggerAttached are non-fatal,
    //   - the original size() command is retried, and the retry succeeds.
    const detachErr = new Error(
      'Debugger is not attached to the tab with id: 1302238007.',
    );

    let evalCount = 0;
    (chrome.debugger.sendCommand as any).mockImplementation(
      async (_target: unknown, method: string, params: any) => {
        if (method !== 'Runtime.evaluate') {
          throw new Error(`unexpected CDP call: ${method}`);
        }
        evalCount++;
        const expression: string = params?.expression ?? '';
        const isSizeProbe =
          expression.includes('window.innerWidth') &&
          expression.includes('window.innerHeight');

        // size() main evaluate: fail the first time (forces lazy attach),
        // succeed afterwards (the post-attach retry).
        if (isSizeProbe) {
          if (evalCount === 1) {
            throw detachErr;
          }
          return {
            result: { value: { width: 1024, height: 768 } },
          };
        }

        // Anything else in this scenario is the water-flow animation
        // setup, which we simulate as failing once because the debugger
        // race detached in the meantime.
        throw detachErr;
      },
    );

    const result = await page.size();
    expect(result).toEqual({ width: 1024, height: 768 });
    // attach was triggered exactly once by the lazy retry path.
    expect(chrome.debugger.attach).toHaveBeenCalledTimes(1);
  });
});
