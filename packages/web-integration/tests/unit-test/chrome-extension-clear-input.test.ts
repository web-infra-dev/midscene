import type { ElementInfo } from '@midscene/shared/extractor';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
}));

import ChromeExtensionProxyPage from '../../src/chrome-extension/page';

type DebuggerCommandSender = {
  sendCommandToDebugger: (
    command: string,
    params: Record<string, unknown>,
  ) => Promise<unknown>;
};

describe('ChromeExtensionProxyPage clearInput', () => {
  let page: ChromeExtensionProxyPage;

  beforeEach(() => {
    vi.clearAllMocks();
    page = new ChromeExtensionProxyPage(false);
  });

  it('selects all text with a raw CDP key event before pressing Backspace', async () => {
    const click = vi.spyOn(page.mouse, 'click').mockResolvedValue();
    const press = vi.spyOn(page.keyboard, 'press').mockResolvedValue();
    const sendCommand = vi
      .spyOn(page as unknown as DebuggerCommandSender, 'sendCommandToDebugger')
      .mockResolvedValue(undefined);

    await page.clearInput({ center: [12, 34] } as ElementInfo);

    expect(click).toHaveBeenCalledWith(12, 34);
    expect(sendCommand).toHaveBeenNthCalledWith(1, 'Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      commands: ['selectAll'],
    });
    expect(sendCommand).toHaveBeenNthCalledWith(2, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
    });
    expect(press).toHaveBeenCalledWith({ key: 'Backspace' });
  });

  it('rejects a missing element instead of silently skipping the clear', async () => {
    await expect(
      page.clearInput(undefined as unknown as ElementInfo),
    ).rejects.toThrow('Chrome extension clearInput requires an element');
  });
});
