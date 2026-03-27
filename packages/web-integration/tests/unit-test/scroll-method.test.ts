import { WebPage as PlaywrightWebPage } from '@/playwright/page';
import { PuppeteerWebPage } from '@/puppeteer/page';
import { InteractionMode } from '@/web-element';
import { describe, expect, it, vi } from 'vitest';

describe('web scroll methods', () => {
  it('does not expose touch gestures in action space by default', async () => {
    const page = {
      mouse: {
        move: vi.fn().mockResolvedValue(undefined),
        wheel: vi.fn().mockResolvedValue(undefined),
      },
      createCDPSession: vi.fn(),
    };
    const webPage = new PuppeteerWebPage(page as any);

    const actionNames = webPage.actionSpace().map((action) => action.name);

    expect(actionNames).not.toContain('Swipe');
    expect(actionNames).not.toContain('Pinch');
    expect(actionNames).toContain('Scroll');
  });

  it('exposes swipe and pinch when touch actions are enabled', async () => {
    const page = {
      mouse: {
        move: vi.fn().mockResolvedValue(undefined),
        wheel: vi.fn().mockResolvedValue(undefined),
      },
      createCDPSession: vi.fn(),
    };
    const webPage = new PuppeteerWebPage(page as any, {
      enableTouchEventsInActionSpace: true,
    });

    const actionNames = webPage.actionSpace().map((action) => action.name);

    expect(actionNames).toContain('Swipe');
    expect(actionNames).toContain('Pinch');
  });

  it('uses touch interaction mode to expose touch actions', async () => {
    const page = {
      mouse: {
        move: vi.fn().mockResolvedValue(undefined),
        wheel: vi.fn().mockResolvedValue(undefined),
      },
      createCDPSession: vi.fn(),
    };
    const webPage = new PuppeteerWebPage(page as any, {
      interactionMode: InteractionMode.Touch,
    });

    const actionNames = webPage.actionSpace().map((action) => action.name);

    expect(actionNames).toContain('Swipe');
    expect(actionNames).toContain('Pinch');
  });

  it('uses wheel events by default for Puppeteer', async () => {
    const mouse = {
      move: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      mouse,
      createCDPSession: vi.fn(),
    };
    const webPage = new PuppeteerWebPage(page as any);

    await webPage.mouse.wheel(12, -34);

    expect(mouse.wheel).toHaveBeenCalledWith({
      deltaX: 12,
      deltaY: -34,
    });
    expect(page.createCDPSession).not.toHaveBeenCalled();
  });

  it('uses CDP scroll gestures in touch interaction mode for Puppeteer', async () => {
    const mouse = {
      move: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
    };
    const session = {
      send: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      mouse,
      createCDPSession: vi.fn().mockResolvedValue(session),
    };
    const webPage = new PuppeteerWebPage(page as any, {
      interactionMode: InteractionMode.Touch,
    });

    await webPage.mouse.move(300, 400);
    await webPage.mouse.wheel(120, 240);

    expect(page.createCDPSession).toHaveBeenCalledTimes(1);
    expect(session.send).toHaveBeenCalledWith('Input.synthesizeScrollGesture', {
      x: 300,
      y: 400,
      xDistance: -120,
      yDistance: -240,
      speed: 9999999,
      repeatCount: 0,
      preventFling: true,
    });
    expect(session.detach).toHaveBeenCalledTimes(1);
    expect(mouse.wheel).not.toHaveBeenCalled();
  });

  it('uses CDP scroll gestures when legacy touch-actions flag is enabled', async () => {
    const mouse = {
      move: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
    };
    const session = {
      send: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
    };
    const page = {
      mouse,
      createCDPSession: vi.fn().mockResolvedValue(session),
    };
    const webPage = new PuppeteerWebPage(page as any, {
      enableTouchEventsInActionSpace: true,
    });

    await webPage.mouse.move(120, 220);
    await webPage.mouse.wheel(10, 20);

    expect(session.send).toHaveBeenCalledWith('Input.synthesizeScrollGesture', {
      x: 120,
      y: 220,
      xDistance: -10,
      yDistance: -20,
      speed: 9999999,
      repeatCount: 0,
      preventFling: true,
    });
    expect(mouse.wheel).not.toHaveBeenCalled();
  });

  it('uses CDP scroll gestures in touch interaction mode for Playwright', async () => {
    const mouse = {
      move: vi.fn().mockResolvedValue(undefined),
      wheel: vi.fn().mockResolvedValue(undefined),
    };
    const session = {
      send: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
    };
    const context = {
      newCDPSession: vi.fn().mockResolvedValue(session),
      browser: () => ({
        browserType: () => ({
          name: () => 'chromium',
        }),
      }),
    };
    const page = {
      mouse,
      context: () => context,
    };
    const webPage = new PlaywrightWebPage(page as any, {
      interactionMode: InteractionMode.Touch,
    });

    await webPage.mouse.move(500, 600);
    await webPage.mouse.wheel(-80, 160);

    expect(context.newCDPSession).toHaveBeenCalledWith(page);
    expect(session.send).toHaveBeenCalledWith('Input.synthesizeScrollGesture', {
      x: 500,
      y: 600,
      xDistance: 80,
      yDistance: -160,
      speed: 9999999,
      repeatCount: 0,
      preventFling: true,
    });
    expect(session.detach).toHaveBeenCalledTimes(1);
    expect(mouse.wheel).not.toHaveBeenCalled();
  });
});
