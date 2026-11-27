import { afterEach, describe, expect, it, rs } from '@rstest/core';

rs.stubGlobal('chrome', {});
rs.mock('@midscene/shared/logger', () => ({
  getDebug: rs.fn(() => rs.fn()),
}));

import ChromeExtensionProxyPage from '../../src/chrome-extension/page';

type DebuggerTransport = {
  sendCommandToDebugger(command: string, params?: object): Promise<unknown>;
};

describe('ChromeExtensionProxyPage.swipe duration', () => {
  afterEach(() => {
    rs.restoreAllMocks();
  });

  it.each(
    [false, true].flatMap((mobile) =>
      [undefined, 100, 300, 500, 1000].map((duration) => ({
        mobile,
        duration,
        expected: Math.max(150, duration ?? 300),
      })),
    ),
  )(
    'preserves duration $duration (mobile: $mobile, minimum 150ms)',
    async ({ mobile, duration, expected }) => {
      const page = new ChromeExtensionProxyPage(true);
      const send = rs
        .spyOn(page as unknown as DebuggerTransport, 'sendCommandToDebugger')
        .mockResolvedValue({ result: { value: mobile } });
      rs.spyOn(page.mouse, 'move').mockResolvedValue(undefined);
      let scheduledWait = 0;
      rs.spyOn(global, 'setTimeout').mockImplementation(
        (fn: any, ms?: number) => {
          scheduledWait += ms ?? 0;
          fn();
          return 0 as any;
        },
      );

      await page.swipe({ x: 200, y: 300 }, { x: 200, y: 100 }, duration);

      expect(scheduledWait).toBeCloseTo(expected);
      const lastCommand = send.mock.calls.at(-1);
      expect(lastCommand?.[1]).toMatchObject(
        mobile
          ? { type: 'touchEnd' }
          : { type: 'mouseReleased', x: 200, y: 100 },
      );
    },
  );
});
