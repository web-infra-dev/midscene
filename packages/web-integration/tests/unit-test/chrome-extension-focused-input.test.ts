import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import puppeteer from 'puppeteer';

rs.stubGlobal('chrome', {});
rs.mock('@midscene/shared/logger', () => ({
  getDebug: rs.fn(() => rs.fn()),
}));

import ChromeExtensionProxyPage from '../../src/chrome-extension/page';

// Test the debugger boundary without making a private transport method public.
type DebuggerTransport = {
  sendCommandToDebugger(command: string, params?: object): Promise<unknown>;
};

describe('Chrome extension focused input selection', () => {
  let page: ChromeExtensionProxyPage;

  beforeEach(() => {
    page = new ChromeExtensionProxyPage(true);
  });

  it('selects the focused field without clicking or clearing', async () => {
    const send = rs
      .spyOn(page as unknown as DebuggerTransport, 'sendCommandToDebugger')
      .mockResolvedValue({
        result: { value: true },
      });
    const click = rs.spyOn(page.mouse, 'click');
    await page.selectAllInput();
    expect(click).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe('Runtime.evaluate');
  });

  it('refuses to select page content when no editable field is focused', async () => {
    const send = rs
      .spyOn(page as unknown as DebuggerTransport, 'sendCommandToDebugger')
      .mockResolvedValue({
        result: { value: false },
      });
    await expect(page.selectAllInput()).rejects.toThrow(/focused editable/i);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe('Runtime.evaluate');
  });

  it('replaces focused text through real Chrome CDP without an intermediate empty value', async () => {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const tab = await browser.newPage();
      await tab.setContent(`
        <input id="target" value="old value">
        <input id="other" value="unchanged">
      `);
      const changes: string[] = [];
      await tab.exposeFunction('recordInput', (value: string) => {
        changes.push(value);
      });
      await tab.$eval('#target', (element) => {
        const field = element as HTMLInputElement;
        field.addEventListener('input', () => {
          void (
            window as unknown as {
              recordInput(value: string): Promise<void>;
            }
          ).recordInput(field.value);
        });
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      });
      const session = await tab.createCDPSession();
      // Only replace the extension transport. Selection and insertion execute
      // unchanged against Chrome; this does not exercise chrome.debugger setup.
      rs.spyOn(
        page as unknown as DebuggerTransport,
        'sendCommandToDebugger',
      ).mockImplementation((command, params) =>
        session.send(
          command as Parameters<typeof session.send>[0],
          params as never,
        ),
      );
      const input = page
        .actionSpace()
        .find((action) => action.name === 'Input');
      expect(input).toBeDefined();
      await input!.call(
        { value: 'new value', inputStrategy: 'bulk' },
        {
          task: {
            type: 'Action Space',
            taskId: 'focused-input-replace',
            status: 'running',
            executor: async () => {},
          },
        },
      );
      await rs.waitFor(() => expect(changes).toEqual(['new value']));
      expect(
        await tab.$eval(
          '#target',
          (element) => (element as HTMLInputElement).value,
        ),
      ).toBe('new value');
      expect(
        await tab.$eval(
          '#other',
          (element) => (element as HTMLInputElement).value,
        ),
      ).toBe('unchanged');
    } finally {
      await browser.close();
    }
  });
});
