import type { VirtualWebSurface } from '@/common/virtual-web-surface';
import { Page } from '@/puppeteer/base-page';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function createRealPage() {
  return {
    url: vi.fn(() => 'https://example.com'),
    evaluate: vi.fn().mockResolvedValue({ width: 1280, height: 720 }),
    screenshot: vi.fn().mockResolvedValue('real-screenshot'),
    waitForSelector: vi.fn().mockResolvedValue(true),
    waitForNetworkIdle: vi.fn().mockResolvedValue(true),
    mouse: {
      click: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
    },
    keyboard: {
      type: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      up: vi.fn().mockResolvedValue(undefined),
    },
  } as any;
}

function createVirtualSurface(): VirtualWebSurface {
  return {
    size: vi.fn().mockResolvedValue({ width: 640, height: 480 }),
    screenshotBase64: vi.fn().mockResolvedValue('virtual-screenshot'),
    getElementsNodeTree: vi.fn().mockResolvedValue({
      node: null,
      children: [],
    }),
    cacheFeatureForPoint: vi.fn().mockResolvedValue({ xpaths: ['virtual'] }),
    rectMatchesCacheFeature: vi
      .fn()
      .mockResolvedValue({ left: 1, top: 2, width: 3, height: 4 }),
    dispatchAction: vi.fn().mockResolvedValue(undefined),
  };
}

describe('BasePage surface router integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes UI observations and input to the active virtual surface', async () => {
    const realPage = createRealPage();
    const page = new Page(realPage, 'puppeteer');
    const virtualSurface = createVirtualSurface();
    page.surfaceRouter.activateVirtualSurface(virtualSurface);

    await expect(page.size()).resolves.toEqual({ width: 640, height: 480 });
    await expect(page.screenshotBase64()).resolves.toBe('virtual-screenshot');
    await expect(page.getElementsNodeTree()).resolves.toEqual({
      node: null,
      children: [],
    });
    await page.mouse.click(12, 34);
    await page.scrollDown();
    await page.navigate('https://virtual.example.com');

    expect(realPage.evaluate).not.toHaveBeenCalled();
    expect(realPage.screenshot).not.toHaveBeenCalled();
    expect(realPage.mouse.click).not.toHaveBeenCalled();
    expect(virtualSurface.dispatchAction).toHaveBeenCalledWith({
      type: 'mouse.click',
      x: 12,
      y: 34,
      button: 'left',
      count: 1,
    });
    expect(virtualSurface.dispatchAction).toHaveBeenCalledWith({
      type: 'mouse.wheel',
      deltaX: 0,
      deltaY: 336,
    });
    expect(virtualSurface.dispatchAction).toHaveBeenCalledWith({
      type: 'navigation.navigate',
      url: 'https://virtual.example.com',
    });
  });

  it('returns an in-flight real click when a virtual surface is activated', async () => {
    let finishRealClick!: () => void;
    const realPage = createRealPage();
    realPage.mouse.click.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRealClick = resolve;
        }),
    );
    const page = new Page(realPage, 'puppeteer');
    const virtualSurface = createVirtualSurface();

    const clickPromise = page.mouse.click(12, 34);
    await vi.waitFor(() => expect(realPage.mouse.click).toHaveBeenCalled());
    const virtualLease =
      page.surfaceRouter.activateVirtualSurface(virtualSurface);

    await expect(clickPromise).resolves.toBeUndefined();
    expect(page.surfaceRouter.interruptedRealOperationCount).toBe(1);

    finishRealClick();
    const resumingLease = page.surfaceRouter.beginResuming(virtualLease);
    await page.surfaceRouter.waitForInterruptedRealOperations();
    page.surfaceRouter.finishResuming(resumingLease);

    expect(page.surfaceRouter.getState().mode).toBe('real');
  });

  it('skips real-page settling while virtual but still invokes the after hook', async () => {
    const realPage = createRealPage();
    const afterHook = vi.fn();
    const page = new Page(realPage, 'puppeteer', {
      afterInvokeAction: afterHook,
    });
    page.surfaceRouter.activateVirtualSurface(createVirtualSurface());

    await page.afterInvokeAction('Tap', { x: 12, y: 34 });

    expect(realPage.waitForSelector).not.toHaveBeenCalled();
    expect(realPage.waitForNetworkIdle).not.toHaveBeenCalled();
    expect(afterHook).toHaveBeenCalledWith('Tap', { x: 12, y: 34 });
  });

  it('rejects real-DOM JavaScript evaluation while virtual', async () => {
    const realPage = createRealPage();
    const page = new Page(realPage, 'puppeteer');
    page.surfaceRouter.activateVirtualSurface(createVirtualSurface());

    await expect(page.evaluateJavaScript('document.title')).rejects.toThrow(
      'evaluateJavaScript is unavailable while a virtual web surface is active',
    );
    expect(realPage.evaluate).not.toHaveBeenCalled();
  });
});
