import { afterAll, beforeAll, beforeEach, expect, it, rs } from '@rstest/core';
import puppeteer, { type Browser } from 'puppeteer';
import ChromeExtensionProxyPage from '../../src/chrome-extension/page';

type DebuggerTransport = {
  sendCommandToDebugger(command: string, params?: object): Promise<any>;
};
let browser: Browser;
beforeAll(async () => {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
afterAll(async () => {
  await browser?.close();
});
beforeEach(() => {
  rs.stubGlobal('chrome', {});
});

it.each(['left', 'right'] as const)(
  'measures and scrolls a real horizontal container toward %s through the extension adapter',
  async (direction) => {
    const tab = await browser.newPage();
    try {
      await tab.setContent(
        '<style>body{margin:0}#target{width:300px;height:200px;overflow:auto}#row{width:1200px;height:180px}</style><div id="target"><div id="row">content</div></div>',
      );
      if (direction === 'left')
        await tab.evaluate(() => {
          document.querySelector('#target')!.scrollLeft = 900;
        });
      const cdp = await tab.createCDPSession();
      const adapter = new ChromeExtensionProxyPage(false);
      rs.spyOn(
        adapter as unknown as DebuggerTransport,
        'sendCommandToDebugger',
      ).mockImplementation((method, params) => cdp.send(method as any, params));
      await adapter.mouse.move(150, 100);
      const before = await adapter.captureScrollState({ direction: 'down' });
      await adapter.scrollDown(150);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const stalled = await adapter.captureScrollState({ direction: 'down' });
      expect(stalled!.targetId).toBe(before!.targetId);
      expect(stalled).toMatchObject({
        scrollLeft: direction === 'left' ? 900 : 0,
        scrollTop: 0,
        maxScrollLeft: 900,
        maxScrollTop: 0,
      });
      if (direction === 'left') await adapter.scrollLeft(200);
      else await adapter.scrollRight(200);
      await rs.waitFor(async () => {
        const after = await adapter.captureScrollState({ direction });
        expect(after!.targetId).toBe(before!.targetId);
        expect(after!.scrollLeft).toBe(direction === 'left' ? 700 : 200);
      });
    } finally {
      await tab.close();
    }
  },
);

it('uses the dispatched zero coordinate and returns CDP exceptions as observation errors', async () => {
  const adapter = new ChromeExtensionProxyPage(false);
  const send = rs
    .spyOn(adapter as unknown as DebuggerTransport, 'sendCommandToDebugger')
    .mockResolvedValue({ result: { value: undefined } });
  await adapter.mouse.move(40, 50);
  await adapter.mouse.wheel(0, 100, 0, 0);
  expect(send.mock.calls.at(-1)?.[1]).toMatchObject({ x: 0, y: 0 });
  await adapter.captureScrollState({ direction: 'down' });
  expect(send.mock.calls.at(-1)?.[1]).toMatchObject({ returnByValue: true });
  expect(
    (send.mock.calls.at(-1)?.[1] as { expression: string }).expression,
  ).toContain(')(0,0)');
  await adapter.captureScrollState({
    direction: 'right',
    locate: { center: [120, 80], description: 'horizontal panel' },
  });
  expect(
    (send.mock.calls.at(-1)?.[1] as { expression: string }).expression,
  ).toContain(')(120,80)');
  send.mockResolvedValue({
    result: {},
    exceptionDetails: { text: 'context gone' },
  });
  await expect(
    adapter.captureScrollState({ direction: 'down' }),
  ).rejects.toThrow('context gone');
});
