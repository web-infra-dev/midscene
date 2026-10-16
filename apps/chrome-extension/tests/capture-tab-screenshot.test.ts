import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { captureTabScreenshot } from '../src/scripts/captureTabScreenshot';

const sourceTab = { id: 1, windowId: 10 } as chrome.tabs.Tab;

function stubChrome(
  query: ReturnType<typeof rs.fn>,
  captureVisibleTab: ReturnType<typeof rs.fn>,
) {
  const addListener = rs.fn();
  const removeListener = rs.fn();
  rs.stubGlobal('chrome', {
    tabs: {
      query,
      captureVisibleTab,
      onActivated: { addListener, removeListener },
    },
  });
  return { addListener, removeListener };
}

describe('captureTabScreenshot', () => {
  afterEach(() => {
    rs.unstubAllGlobals();
  });

  it('captures the requesting tab while it remains active', async () => {
    const query = rs.fn().mockResolvedValue([{ id: 1 }]);
    const captureVisibleTab = rs
      .fn()
      .mockResolvedValue('data:image/png;base64,a');
    const { addListener, removeListener } = stubChrome(
      query,
      captureVisibleTab,
    );

    await expect(captureTabScreenshot(sourceTab)).resolves.toBe(
      'data:image/png;base64,a',
    );
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledWith({ active: true, windowId: 10 });
    expect(captureVisibleTab).toHaveBeenCalledWith(10, { format: 'png' });
    expect(removeListener).toHaveBeenCalledWith(addListener.mock.calls[0][0]);
  });

  it('does not capture another tab when the source is already inactive', async () => {
    const query = rs.fn().mockResolvedValue([{ id: 2 }]);
    const captureVisibleTab = rs.fn();
    stubChrome(query, captureVisibleTab);

    await expect(captureTabScreenshot(sourceTab)).resolves.toBeNull();
    expect(captureVisibleTab).not.toHaveBeenCalled();
  });

  it('discards a capture if the active tab changes during capture', async () => {
    const query = rs
      .fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2 }]);
    const captureVisibleTab = rs.fn().mockResolvedValue('other tab screenshot');
    stubChrome(query, captureVisibleTab);

    await expect(captureTabScreenshot(sourceTab)).resolves.toBeNull();
    expect(captureVisibleTab).toHaveBeenCalledTimes(1);
  });

  it('discards a capture even if the source tab becomes active again', async () => {
    const query = rs.fn().mockResolvedValue([{ id: 1 }]);
    let onActivated:
      | ((activeInfo: chrome.tabs.TabActiveInfo) => void)
      | undefined;
    const captureVisibleTab = rs.fn().mockImplementation(async () => {
      onActivated?.({ tabId: 2, windowId: 10 });
      onActivated?.({ tabId: 1, windowId: 10 });
      return 'other tab screenshot';
    });
    const { addListener } = stubChrome(query, captureVisibleTab);
    addListener.mockImplementation((listener) => {
      onActivated = listener;
    });

    await expect(captureTabScreenshot(sourceTab)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });
});
