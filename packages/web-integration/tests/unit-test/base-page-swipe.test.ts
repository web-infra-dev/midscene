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

describe('Page.swipe duration', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  it.each(
    (['puppeteer', 'playwright'] as const).flatMap((backend) =>
      [undefined, 100, 300, 500, 1000].map((duration) => ({
        backend,
        duration,
        expected: Math.max(150, duration ?? 100),
      })),
    ),
  )(
    'preserves duration $duration in $backend (minimum 150ms)',
    async ({ backend, duration, expected }) => {
      const { underlyingPage, mouse } = createMockPage();
      let scheduledWait = 0;
      underlyingPage.waitForTimeout = rs.fn(async (ms: number) => {
        scheduledWait += ms;
      });
      rs.spyOn(global, 'setTimeout').mockImplementation(
        (fn: any, ms?: number) => {
          scheduledWait += ms ?? 0;
          fn();
          return 0 as any;
        },
      );
      const page = new Page(underlyingPage, backend);
      await page.swipe({ x: 200, y: 300 }, { x: 200, y: 100 }, duration);
      expect(scheduledWait).toBeCloseTo(expected);
      expect(mouse.move).toHaveBeenLastCalledWith(200, 100);
      expect(mouse.up).toHaveBeenCalledTimes(1);
    },
  );
});
