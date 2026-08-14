import type { AlertVirtualSurface } from '@/puppeteer/alert-virtual-surface';
import { PuppeteerWebPage } from '@/puppeteer/page';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
  logMsg: vi.fn(),
}));

vi.mock('@/web-page', () => ({
  commonWebActionsForWebPage: vi.fn(() => []),
}));

describe('Puppeteer native alert routing', () => {
  it('shows the virtual surface until its OK hot area accepts the dialog', async () => {
    let dialogHandler: ((dialog: any) => void) | undefined;
    const page = {
      on: vi.fn((event: string, handler: (dialog: any) => void) => {
        if (event === 'dialog') dialogHandler = handler;
      }),
      off: vi.fn(),
      viewport: vi.fn(() => ({ width: 640, height: 480 })),
      url: vi.fn(() => 'https://example.com'),
      mouse: {
        move: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
      },
      keyboard: {
        type: vi.fn().mockResolvedValue(undefined),
        down: vi.fn().mockResolvedValue(undefined),
        up: vi.fn().mockResolvedValue(undefined),
      },
    } as any;
    const dialog = {
      type: vi.fn(() => 'alert'),
      message: vi.fn(() => 'Alert blocking fixture'),
      accept: vi.fn().mockResolvedValue(undefined),
    };
    const webPage = new PuppeteerWebPage(page);

    expect(dialogHandler).toBeDefined();
    dialogHandler!(dialog);
    await vi.waitFor(() =>
      expect(webPage.surfaceRouter.getState().mode).toBe('virtual'),
    );

    const state = webPage.surfaceRouter.getState();
    expect(state.mode).toBe('virtual');
    if (state.mode !== 'virtual') throw new Error('expected virtual surface');
    const surface = state.virtualSurface as AlertVirtualSurface;
    await expect(webPage.screenshotBase64()).resolves.toMatch(
      /^data:image\/jpeg;base64,/,
    );

    await webPage.mouse.click(
      surface.confirmRect.left + surface.confirmRect.width / 2,
      surface.confirmRect.top + surface.confirmRect.height / 2,
    );

    await vi.waitFor(() =>
      expect(webPage.surfaceRouter.getState().mode).toBe('real'),
    );
    expect(dialog.accept).toHaveBeenCalledTimes(1);
    expect(page.mouse.click).not.toHaveBeenCalled();

    await webPage.destroy();
    expect(page.off).toHaveBeenCalledWith('dialog', dialogHandler);
  });
});
