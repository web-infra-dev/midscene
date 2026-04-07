import { Page } from '@/puppeteer/base-page';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
  logMsg: vi.fn(),
}));

vi.mock('@midscene/core/utils', async () => {
  const actual = await vi.importActual('@midscene/core/utils');
  return {
    ...actual,
    sleep: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('@midscene/shared/node', () => ({
  getElementInfosScriptContent: vi.fn(() => ''),
  getExtraReturnLogic: vi.fn(() => Promise.resolve('() => ({})')),
}));

vi.mock('@/web-page', () => ({
  commonWebActionsForWebPage: vi.fn(() => []),
}));

// NOTE: evaluate mocks execute the callback directly in Node rather than in a
// browser sandbox.  This means checks like `document.visibilityState` are
// validated against Node globals (set via vi.stubGlobal), not a real browser.
// A real-browser integration test is still needed for full confidence.

function stubRaf() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
}

function createEvaluateMock() {
  return vi.fn().mockImplementation(async (fn: () => unknown) => {
    stubRaf();
    return await fn();
  });
}

function createMockPage(
  overrides: Record<string, unknown> = {},
  interfaceType: 'playwright' | 'puppeteer' = 'playwright',
) {
  const base: Record<string, unknown> = {
    url: () => 'http://example.com',
    isClosed: () => false,
    evaluate: createEvaluateMock(),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('shot')),
    context: () => ({
      browser: () => ({
        browserType: () => ({
          name: () => 'chromium',
        }),
      }),
      newCDPSession: vi.fn(),
    }),
    ...overrides,
  };

  if (interfaceType === 'puppeteer') {
    // Puppeteer screenshot returns a base64 string when encoding is 'base64'
    if (!overrides.screenshot) {
      base.screenshot = vi.fn().mockResolvedValue('cHVwcGV0ZWVyLXNob3Q=');
    }
  }

  return base as any;
}

describe('Page screenshotBase64', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits for a visual paint before taking a playwright screenshot', async () => {
    const callOrder: string[] = [];
    const evaluate = vi.fn().mockImplementation(async (fn: () => unknown) => {
      callOrder.push('evaluate');
      stubRaf();
      return await fn();
    });
    const screenshot = vi.fn().mockImplementation(async () => {
      callOrder.push('screenshot');
      return Buffer.from('paint-ready-shot');
    });
    const mockPage = createMockPage({ evaluate, screenshot });

    const page = new Page(mockPage, 'playwright');
    await page.screenshotBase64();

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(screenshot).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['evaluate', 'screenshot']);
  });

  it('uses the regular playwright screenshot path when it succeeds', async () => {
    const newCDPSession = vi.fn();
    const mockPage = createMockPage({
      context: () => ({
        browser: () => ({
          browserType: () => ({ name: () => 'chromium' }),
        }),
        newCDPSession,
      }),
    });

    const page = new Page(mockPage, 'playwright');
    const result = await page.screenshotBase64();

    expect(result).toContain('data:image/jpeg;base64,');
    expect(mockPage.screenshot).toHaveBeenCalledTimes(1);
    expect(newCDPSession).not.toHaveBeenCalled();
  });

  it('skips the visual paint wait when the page is hidden', async () => {
    const raf = vi.fn(() => {
      throw new Error('requestAnimationFrame should not run on hidden pages');
    });
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    vi.stubGlobal('requestAnimationFrame', raf);

    const callOrder: string[] = [];
    const evaluate = vi.fn().mockImplementation(async (fn: () => unknown) => {
      callOrder.push('evaluate');
      return await fn();
    });
    const screenshot = vi.fn().mockImplementation(async () => {
      callOrder.push('screenshot');
      return Buffer.from('hidden-page-shot');
    });
    const mockPage = createMockPage({ evaluate, screenshot });

    const page = new Page(mockPage, 'playwright');
    await page.screenshotBase64();

    expect(raf).not.toHaveBeenCalled();
    expect(callOrder).toEqual(['evaluate', 'screenshot']);
  });

  it('degrades gracefully when evaluate throws a non-close error', async () => {
    const evaluate = vi
      .fn()
      .mockRejectedValue(new Error('random evaluate failure'));
    const screenshot = vi.fn().mockResolvedValue(Buffer.from('fallback-shot'));
    const mockPage = createMockPage({ evaluate, screenshot });

    const page = new Page(mockPage, 'playwright');
    const result = await page.screenshotBase64();

    expect(result).toContain('data:image/jpeg;base64,');
    expect(screenshot).toHaveBeenCalledTimes(1);
  });

  it('works with the puppeteer screenshot path', async () => {
    const mockPage = createMockPage({}, 'puppeteer');

    const page = new Page(mockPage, 'puppeteer');
    const result = await page.screenshotBase64();

    expect(result).toContain('data:image/jpeg;base64,');
    expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
    expect(mockPage.screenshot).toHaveBeenCalledTimes(1);
  });

  it('falls back to a CDP screenshot when playwright screenshot times out', async () => {
    const screenshot = vi
      .fn()
      .mockRejectedValue(
        new Error('page.screenshot: Timeout 10000ms exceeded.'),
      );
    const detach = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue({ data: 'Y2RwLXNob3Q=' });
    const newCDPSession = vi.fn().mockResolvedValue({
      send,
      detach,
    });
    const mockPage = createMockPage({
      screenshot,
      context: () => ({
        browser: () => ({
          browserType: () => ({ name: () => 'chromium' }),
        }),
        newCDPSession,
      }),
    });

    const page = new Page(mockPage, 'playwright');
    const result = await page.screenshotBase64();

    expect(result).toContain('data:image/jpeg;base64,');
    expect(newCDPSession).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 90,
    });
    expect(detach).toHaveBeenCalledTimes(1);
  });
});
