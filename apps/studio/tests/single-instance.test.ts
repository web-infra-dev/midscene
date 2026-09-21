import { describe, expect, it, vi } from 'vitest';
import {
  acquireStudioSingleInstanceLock,
  restoreAndFocusStudioWindow,
} from '../src/main/single-instance';

function createApplication({
  acquired = true,
  isPackaged = true,
}: {
  acquired?: boolean;
  isPackaged?: boolean;
} = {}) {
  return {
    isPackaged,
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => acquired),
  };
}

function createWindow({
  calls = [] as string[],
  destroyed = false,
  minimized = false,
  visible = true,
} = {}) {
  let isMinimized = minimized;
  let isVisible = visible;

  return {
    calls,
    window: {
      focus: () => calls.push('focus'),
      isDestroyed: () => destroyed,
      isMinimized: () => isMinimized,
      isVisible: () => isVisible,
      restore: () => {
        calls.push('restore');
        isMinimized = false;
        isVisible = true;
      },
      show: () => {
        calls.push('show-window');
        isVisible = true;
      },
    },
  };
}

describe('Studio single-instance lock', () => {
  it('keeps unpackaged development instances independent', () => {
    const application = createApplication({ isPackaged: false });

    expect(acquireStudioSingleInstanceLock(application)).toBe(true);
    expect(application.requestSingleInstanceLock).not.toHaveBeenCalled();
    expect(application.quit).not.toHaveBeenCalled();
  });

  it('continues bootstrapping when the packaged instance acquires the lock', () => {
    const application = createApplication();

    expect(acquireStudioSingleInstanceLock(application)).toBe(true);
    expect(application.requestSingleInstanceLock).toHaveBeenCalledOnce();
    expect(application.quit).not.toHaveBeenCalled();
  });

  it('quits a packaged secondary instance immediately', () => {
    const application = createApplication({ acquired: false });

    expect(acquireStudioSingleInstanceLock(application)).toBe(false);
    expect(application.requestSingleInstanceLock).toHaveBeenCalledOnce();
    expect(application.quit).toHaveBeenCalledOnce();
  });

  it('does not silently continue when Electron cannot request the lock', () => {
    const application = createApplication();
    application.requestSingleInstanceLock.mockImplementation(() => {
      throw new Error('lock unavailable');
    });

    expect(() => acquireStudioSingleInstanceLock(application)).toThrow(
      'lock unavailable',
    );
    expect(application.quit).not.toHaveBeenCalled();
  });
});

describe('Studio window activation', () => {
  it('focuses an already visible window without changing its state', () => {
    const { calls, window } = createWindow();

    restoreAndFocusStudioWindow(window);

    expect(calls).toEqual(['focus']);
  });

  it('restores a minimized window before focusing it', () => {
    const { calls, window } = createWindow({
      minimized: true,
      visible: false,
    });

    restoreAndFocusStudioWindow(window);

    expect(calls).toEqual(['restore', 'focus']);
  });

  it('shows a hidden window before focusing it', () => {
    const { calls, window } = createWindow({ visible: false });

    restoreAndFocusStudioWindow(window);

    expect(calls).toEqual(['show-window', 'focus']);
  });

  it('unhides the macOS application before restoring its window', () => {
    const calls: string[] = [];
    const { window } = createWindow({
      calls,
      minimized: true,
      visible: false,
    });
    const application = {
      isHidden: () => true,
      show: () => calls.push('show-application'),
    };

    restoreAndFocusStudioWindow(window, application);

    expect(calls).toEqual(['show-application', 'restore', 'focus']);
  });

  it('does not activate a destroyed window', () => {
    const calls: string[] = [];
    const { window } = createWindow({ calls, destroyed: true });
    const application = {
      isHidden: () => true,
      show: () => calls.push('show-application'),
    };

    restoreAndFocusStudioWindow(window, application);

    expect(calls).toEqual([]);
  });
});
