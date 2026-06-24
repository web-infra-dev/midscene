import { Page } from '@/puppeteer/base-page';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/shared/logger', () => ({
  getDebug: rs.fn(() => rs.fn()),
  logMsg: rs.fn(),
}));

rs.mock('@midscene/shared/node', () => ({
  getElementInfosScriptContent: rs.fn(() => ''),
  getExtraReturnLogic: rs.fn(() => Promise.resolve('() => ({})')),
}));

rs.mock('@/web-element', () => ({
  WebPageContextParser: rs.fn(),
}));

rs.mock('@/web-page', () => ({
  commonWebActionsForWebPage: rs.fn(() => []),
}));

const createMockPage = () => {
  const mouse = { move: rs.fn(), down: rs.fn(), up: rs.fn() };
  const underlyingPage = {
    url: () => 'http://example.com',
    mouse,
    keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
    evaluate: rs.fn(),
  } as any;
  return { underlyingPage, mouse };
};

describe('Page.longPress - duration handling', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  // Run the press immediately instead of actually waiting, and capture the
  // requested delay so we can assert how long the button is held down.
  const spyHeldDuration = () => {
    const setTimeoutSpy = rs
      .spyOn(global, 'setTimeout')
      .mockImplementation((fn: any) => {
        fn();
        return 0 as any;
      });
    return () =>
      setTimeoutSpy.mock.calls.map((call) => call[1]).filter(Boolean);
  };

  it('holds for the full requested duration without capping (regression for #2544)', async () => {
    const { underlyingPage, mouse } = createMockPage();
    const page = new Page(underlyingPage, 'puppeteer');
    const heldDurations = spyHeldDuration();

    await page.longPress(10, 20, 6000);

    expect(mouse.down).toHaveBeenCalledTimes(1);
    expect(mouse.up).toHaveBeenCalledTimes(1);
    expect(heldDurations()).toContain(6000);
  });

  it('raises a too-short duration to the long-press minimum', async () => {
    const { underlyingPage } = createMockPage();
    const page = new Page(underlyingPage, 'puppeteer');
    const heldDurations = spyHeldDuration();

    await page.longPress(10, 20, 100);

    expect(heldDurations()).toContain(300);
  });

  it('falls back to the default duration when omitted', async () => {
    const { underlyingPage } = createMockPage();
    const page = new Page(underlyingPage, 'puppeteer');
    const heldDurations = spyHeldDuration();

    await page.longPress(10, 20);

    expect(heldDurations()).toContain(500);
  });
});
