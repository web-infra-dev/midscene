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
    const { addListener, removeListener } = stubChrome(
      query,
      captureVisibleTab,
    );

    await expect(captureTabScreenshot(sourceTab)).resolves.toBeNull();
    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith(addListener.mock.calls[0][0]);
  });

  it('does not register a listener or capture when the source has no tab ID', async () => {
    const query = rs.fn();
    const captureVisibleTab = rs.fn();
    const { addListener, removeListener } = stubChrome(
      query,
      captureVisibleTab,
    );

    await expect(
      captureTabScreenshot({ ...sourceTab, id: undefined }),
    ).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(captureVisibleTab).not.toHaveBeenCalled();
    expect(addListener).not.toHaveBeenCalled();
    expect(removeListener).not.toHaveBeenCalled();
  });

  it.each(['initial query', 'capture', 'final query'] as const)(
    'propagates the error and removes its listener when the %s fails',
    async (failureStage) => {
      const error = new Error(`${failureStage} failed`);
      const query = rs.fn().mockResolvedValue([{ id: 1 }]);
      const captureVisibleTab = rs
        .fn()
        .mockResolvedValue('data:image/png;base64,a');
      const { addListener, removeListener } = stubChrome(
        query,
        captureVisibleTab,
      );

      if (failureStage === 'initial query') {
        query.mockRejectedValueOnce(error);
      } else if (failureStage === 'capture') {
        captureVisibleTab.mockRejectedValueOnce(error);
      } else {
        query.mockResolvedValueOnce([{ id: 1 }]).mockRejectedValueOnce(error);
      }

      await expect(captureTabScreenshot(sourceTab)).rejects.toBe(error);
      expect(removeListener).toHaveBeenCalledTimes(1);
      expect(removeListener).toHaveBeenCalledWith(addListener.mock.calls[0][0]);
      if (failureStage === 'initial query') {
        expect(captureVisibleTab).not.toHaveBeenCalled();
      }
    },
  );

  it('keeps the capture when a tab is activated in another window', async () => {
    const query = rs.fn().mockResolvedValue([{ id: 1 }]);
    const captureVisibleTab = rs.fn();
    const { addListener, removeListener } = stubChrome(
      query,
      captureVisibleTab,
    );
    captureVisibleTab.mockImplementation(async () => {
      const onActivated = addListener.mock.calls[0][0];
      onActivated({ tabId: 2, windowId: 20 });
      return 'data:image/png;base64,a';
    });

    await expect(captureTabScreenshot(sourceTab)).resolves.toBe(
      'data:image/png;base64,a',
    );
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith(addListener.mock.calls[0][0]);
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
