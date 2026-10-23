import { beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.stubGlobal('chrome', {});
rs.mock('@midscene/shared/logger', () => ({
  getDebug: rs.fn(() => rs.fn()),
}));

import ChromeExtensionProxyPage from '../../src/chrome-extension/page';

describe('Chrome extension focused input selection', () => {
  let page: ChromeExtensionProxyPage;

  beforeEach(() => {
    page = new ChromeExtensionProxyPage(true);
  });

  it('selects the focused field without clicking or clearing', async () => {
    const send = rs.spyOn(page, 'sendCommandToDebugger').mockResolvedValue({
      result: { value: true },
    });
    const click = rs.spyOn(page.mouse, 'click');
    await page.selectAllInput();
    expect(click).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe('Runtime.evaluate');
  });

  it('refuses to select page content when no editable field is focused', async () => {
    const send = rs.spyOn(page, 'sendCommandToDebugger').mockResolvedValue({
      result: { value: false },
    });
    await expect(page.selectAllInput()).rejects.toThrow(/focused editable/i);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe('Runtime.evaluate');
  });
});
