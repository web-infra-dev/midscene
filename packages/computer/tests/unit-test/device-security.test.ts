import type { ExecutorContext } from '@midscene/core';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

const mockState = rs.hoisted(() => {
  const execSync = rs.fn();
  // 1x1 PNG, base64-encoded — what the Windows PowerShell capture prints.
  const FAKE_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const defaultWindowsDisplays = [
    {
      id: '\\\\.\\DISPLAY1',
      name: '\\\\.\\DISPLAY1',
      primary: true,
      bounds: { x: 0, y: 0, width: 800, height: 600 },
    },
  ];
  let windowsDisplays = defaultWindowsDisplays;
  let windowsCursorPos = { x: 10, y: 20 };
  let windowsActiveWindowRect:
    | { x: number; y: number; width: number; height: number }
    | undefined;
  let windowsCursorTransform = (x: number, y: number) => ({ x, y });
  // Windows screenshot/listDisplays go through `powershell.exe -EncodedCommand`
  // now (issue #2150); answer based on which script is being run.
  const execFileSync = rs.fn(
    (
      file?: string,
      args?: string[],
      // Return type stays wide (string | Buffer) so other tests can stub
      // Buffer outputs (e.g. the frontmost-app osascript probe) via
      // mockReturnValueOnce.
    ): string | Buffer | undefined => {
      if (file === 'powershell.exe' && args) {
        const idx = args.indexOf('-EncodedCommand');
        const script =
          idx >= 0
            ? Buffer.from(args[idx + 1], 'base64').toString('utf16le')
            : '';
        if (script.includes('CopyFromScreen')) {
          return FAKE_PNG_BASE64;
        }
        if (script.includes('$midsceneWindowRectBuffer')) {
          const rect = windowsActiveWindowRect;
          return rect ? `${rect.x},${rect.y},${rect.width},${rect.height}` : '';
        }
        if (script.includes('[System.Windows.Forms.Cursor]::Position')) {
          const targetX = script.match(/\$targetX = (-?\d+)/)?.[1];
          const targetY = script.match(/\$targetY = (-?\d+)/)?.[1];
          if (targetX !== undefined && targetY !== undefined) {
            windowsCursorPos = windowsCursorTransform(
              Number(targetX),
              Number(targetY),
            );
          }
          return `${windowsCursorPos.x},${windowsCursorPos.y}`;
        }
        return JSON.stringify(windowsDisplays);
      }
      return undefined;
    },
  );

  const screenshot = rs.fn(async () => Buffer.from('png')) as ReturnType<
    typeof rs.fn
  > & {
    listDisplays: ReturnType<typeof rs.fn>;
  };
  screenshot.listDisplays = rs.fn(async () => [
    { id: 1, name: 'Display 1', primary: true },
  ]);

  let mousePos = { x: 10, y: 20 };
  const libnut = {
    getScreenSize: rs.fn(() => ({ width: 800, height: 600 })),
    getMousePos: rs.fn(() => ({ ...mousePos })),
    moveMouse: rs.fn((x: number, y: number) => {
      mousePos = { x, y };
    }),
    mouseClick: rs.fn(),
    mouseToggle: rs.fn(),
    scrollMouse: rs.fn(),
    keyTap: rs.fn(),
    typeString: rs.fn(),
    getActiveWindow: rs.fn(() => 0),
    getWindowRect: rs.fn(),
    focusWindow: rs.fn(),
  };

  const createRequire = rs.fn(() =>
    rs.fn(() => ({
      libnut,
    })),
  );

  const reset = () => {
    mousePos = { x: 10, y: 20 };
    windowsCursorPos = { x: 10, y: 20 };
    windowsActiveWindowRect = undefined;
    windowsCursorTransform = (x: number, y: number) => ({ x, y });
    windowsDisplays = defaultWindowsDisplays;
    execSync.mockReset();
    // mockClear (not mockReset) so the powershell-aware implementation survives.
    execFileSync.mockClear();
    screenshot.mockClear();
    screenshot.listDisplays.mockClear();
    libnut.getScreenSize.mockClear();
    libnut.getMousePos.mockClear();
    libnut.moveMouse.mockClear();
    libnut.mouseClick.mockClear();
    libnut.mouseToggle.mockClear();
    libnut.scrollMouse.mockClear();
    libnut.keyTap.mockClear();
    libnut.typeString.mockClear();
    libnut.getActiveWindow.mockClear();
    libnut.getActiveWindow.mockReturnValue(0);
    libnut.getWindowRect.mockClear();
    libnut.focusWindow.mockClear();
    createRequire.mockClear();
  };

  const setWindowsDisplays = (displays: typeof defaultWindowsDisplays) => {
    windowsDisplays = displays;
  };

  const setWindowsCursorTransform = (
    transform: (x: number, y: number) => { x: number; y: number },
  ) => {
    windowsCursorTransform = transform;
  };

  const setWindowsActiveWindowRect = (
    rect: { x: number; y: number; width: number; height: number } | undefined,
  ) => {
    windowsActiveWindowRect = rect;
  };

  const getWindowsCursorPos = () => ({ ...windowsCursorPos });

  return {
    execSync,
    execFileSync,
    screenshot,
    libnut,
    createRequire,
    reset,
    setWindowsDisplays,
    setWindowsActiveWindowRect,
    setWindowsCursorTransform,
    getWindowsCursorPos,
  };
});

rs.mock('node:child_process', () => ({
  execSync: mockState.execSync,
  execFileSync: mockState.execFileSync,
}));

rs.mock('screenshot-desktop', () => ({
  default: mockState.screenshot,
}));

rs.mock('node:module', () => ({
  createRequire: mockState.createRequire,
}));

const originalPlatform = process.platform;
const mockExecutorContext = { task: {} } as ExecutorContext;

beforeEach(() => {
  mockState.reset();
  Object.defineProperty(process, 'platform', { value: 'darwin' });
});

afterEach(() => {
  rs.useRealTimers();
  rs.resetModules();
  Object.defineProperty(process, 'platform', { value: originalPlatform });
});

async function createConnectedDevice() {
  const { ComputerDevice } = await import('../../src/device');
  const device = new ComputerDevice({});
  await device.connect();
  return device;
}

async function runKeyboardPress(keyName: string): Promise<void> {
  const device = await createConnectedDevice();

  const keyboardPress = device
    .actionSpace()
    .find((action) => action.name === 'KeyboardPress');

  expect(keyboardPress).toBeDefined();
  await keyboardPress!.call({ keyName }, mockExecutorContext);
}

async function runPointerTap(
  point: { x: number; y: number },
  opts?: { duration?: number },
): Promise<void> {
  const device = await createConnectedDevice();
  await device.inputPrimitives.pointer!.tap(point, opts);
}

async function createConnectedDeviceForPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform });
  const device = await createConnectedDevice();
  mockState.execFileSync.mockClear();
  mockState.libnut.moveMouse.mockClear();
  mockState.libnut.mouseClick.mockClear();
  mockState.libnut.scrollMouse.mockClear();
  return device;
}

describe('ComputerDevice AppleScript security', () => {
  it('uses execFileSync to avoid shell interpolation when sending keys', async () => {
    const payload = `'; touch /tmp/midscene-shell-injection-proof; echo '`;

    await runKeyboardPress(payload);

    expect(mockState.execSync).not.toHaveBeenCalled();
    expect(mockState.execFileSync).toHaveBeenCalledWith('osascript', [
      '-e',
      expect.any(String),
    ]);
  });

  it('escapes quotes and backslashes in keystroke payloads', async () => {
    await runKeyboardPress('a"\\b');

    expect(mockState.execSync).not.toHaveBeenCalled();
    expect(mockState.execFileSync).toHaveBeenCalledWith('osascript', [
      '-e',
      'tell application "System Events" to keystroke "a\\"\\\\b"',
    ]);
  });
});

describe('ComputerDevice destroy input gate', () => {
  it('interrupts an in-flight pointer action and blocks later input', async () => {
    const { ComputerDevice } = await import('../../src/device');
    const device = new ComputerDevice({});
    await device.connect();

    const hoverPromise = device.inputPrimitives.pointer.hover({
      x: 200,
      y: 120,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await device.destroy();

    await expect(hoverPromise).rejects.toThrow(/destroyed/);
    const moveCountAfterDestroy = mockState.libnut.moveMouse.mock.calls.length;

    await expect(
      device.inputPrimitives.pointer.hover({ x: 210, y: 130 }),
    ).rejects.toThrow(/destroyed/);

    expect(mockState.libnut.moveMouse).toHaveBeenCalledTimes(
      moveCountAfterDestroy,
    );
  });

  it('releases the mouse button when destroy interrupts a tap hold', async () => {
    const { ComputerDevice } = await import('../../src/device');
    const device = new ComputerDevice({});
    await device.connect();

    const tapPromise = device.inputPrimitives.pointer.tap({ x: 200, y: 120 });

    await rs.waitFor(() => {
      expect(mockState.libnut.mouseToggle).toHaveBeenCalledWith('down', 'left');
    });

    await device.destroy();

    await expect(tapPromise).rejects.toThrow(/destroyed/);
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledWith('up', 'left');
  });
});

describe('ComputerInputDriver native arg handling', () => {
  // libnut is a native binding that distinguishes "no argument" from
  // "explicit undefined" — passing `(button, undefined)` trips its
  // "A boolean was expected" type check, and `(key, undefined)` trips
  // "A string was expected". The driver wrapper must not forward
  // undefined for optional trailing args.
  it('omits trailing undefined args when calling libnut.mouseClick', async () => {
    const { ComputerInputDriver } = await import('../../src/input-driver');
    const driver = new ComputerInputDriver({
      getLibnut: () => mockState.libnut,
      useAppleScript: () => false,
      sendKeyViaAppleScript: rs.fn(),
      runPhasedScroll: rs.fn(() => true),
      debug: rs.fn(),
    });

    driver.mouseClick('right');
    expect(mockState.libnut.mouseClick).toHaveBeenLastCalledWith('right');
    // Confirm exactly one positional arg — no trailing undefined leaked.
    expect(mockState.libnut.mouseClick.mock.lastCall).toHaveLength(1);

    driver.mouseClick('left', true);
    expect(mockState.libnut.mouseClick).toHaveBeenLastCalledWith('left', true);

    driver.mouseClick();
    expect(mockState.libnut.mouseClick.mock.lastCall).toHaveLength(0);
  });

  it('omits trailing undefined modifiers when calling libnut.keyTap', async () => {
    const { ComputerInputDriver } = await import('../../src/input-driver');
    const driver = new ComputerInputDriver({
      getLibnut: () => mockState.libnut,
      useAppleScript: () => false,
      sendKeyViaAppleScript: rs.fn(),
      runPhasedScroll: rs.fn(() => true),
      debug: rs.fn(),
    });

    driver.keyTap('backspace');
    expect(mockState.libnut.keyTap).toHaveBeenLastCalledWith('backspace');
    expect(mockState.libnut.keyTap.mock.lastCall).toHaveLength(1);

    driver.keyTap('a', ['command']);
    expect(mockState.libnut.keyTap).toHaveBeenLastCalledWith('a', ['command']);
  });
});

describe('ComputerDevice scroll targeting', () => {
  it('anchors untargeted libnut scrolls at screen center without clicking', async () => {
    const device = await createConnectedDeviceForPlatform('win32');

    await device.inputPrimitives.scroll!.scroll({
      scrollType: 'singleAction',
      direction: 'down',
    });

    expect(mockState.getWindowsCursorPos()).toEqual({ x: 400, y: 300 });
    expect(mockState.libnut.moveMouse).not.toHaveBeenCalled();
    expect(mockState.libnut.focusWindow).not.toHaveBeenCalled();
    expect(mockState.libnut.mouseClick).not.toHaveBeenCalled();
    expect(mockState.libnut.scrollMouse).toHaveBeenCalled();
  });

  it('focuses and anchors untargeted Windows scrolls at the active window center', async () => {
    const device = await createConnectedDeviceForPlatform('win32');
    mockState.libnut.getActiveWindow.mockReturnValue(123);
    mockState.setWindowsActiveWindowRect({
      x: 500,
      y: 100,
      width: 200,
      height: 200,
    });
    // libnut's GetWindowRect result is DPI-virtualized and must not be used.
    mockState.libnut.getWindowRect.mockReturnValue({
      x: 160,
      y: 80,
      width: 320,
      height: 320,
    });

    await device.inputPrimitives.scroll!.scroll({
      scrollType: 'singleAction',
      direction: 'down',
    });

    expect(mockState.libnut.getWindowRect).not.toHaveBeenCalled();
    expect(mockState.libnut.focusWindow).toHaveBeenCalledWith(123);
    expect(mockState.getWindowsCursorPos()).toEqual({ x: 600, y: 200 });
    expect(mockState.libnut.moveMouse).not.toHaveBeenCalled();
    expect(mockState.libnut.mouseClick).not.toHaveBeenCalled();
    expect(mockState.libnut.scrollMouse).toHaveBeenCalled();
  });
});

describe('ComputerDevice pointer input', () => {
  it('observes the actual cursor position after non-Windows movement', async () => {
    const device = await createConnectedDeviceForPlatform('darwin');
    mockState.libnut.getMousePos.mockClear();

    await device.inputPrimitives.pointer!.hover({ x: 100, y: 120 });

    // smoothMoveMouse reads the starting point; moveGlobalPointer then reads
    // again after settling so click diagnostics use the observed position.
    expect(mockState.libnut.getMousePos).toHaveBeenCalledTimes(2);
  });

  it('does not trust a self-consistent libnut position outside screenshot space', async () => {
    const device = await createConnectedDeviceForPlatform('win32');

    // This reproduces the previous false-positive check: libnut reports the
    // same point it was asked to move to while the independent WinForms
    // cursor used by screenshots has not moved there.
    mockState.libnut.moveMouse(400, 300);
    expect(mockState.libnut.getMousePos()).toEqual({ x: 400, y: 300 });
    expect(mockState.getWindowsCursorPos()).toEqual({ x: 10, y: 20 });
    mockState.libnut.moveMouse.mockClear();

    await device.inputPrimitives.pointer!.tap({ x: 400, y: 300 });

    expect(mockState.getWindowsCursorPos()).toEqual({ x: 400, y: 300 });
    expect(mockState.libnut.moveMouse).not.toHaveBeenCalled();
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledWith('down', 'left');
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledWith('up', 'left');
  });

  it('moves in screenshot-space coordinates inside the selected Windows display', async () => {
    mockState.setWindowsDisplays([
      {
        id: '\\\\.\\DISPLAY1',
        name: '\\\\.\\DISPLAY1',
        primary: true,
        bounds: { x: 0, y: 0, width: 800, height: 600 },
      },
      {
        id: '\\\\.\\DISPLAY2',
        name: '\\\\.\\DISPLAY2',
        primary: false,
        bounds: { x: -1200, y: -200, width: 1200, height: 900 },
      },
    ]);
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { ComputerDevice } = await import('../../src/device');
    const device = new ComputerDevice({ displayId: '\\\\.\\DISPLAY2' });
    await device.connect();
    mockState.libnut.mouseToggle.mockClear();

    await device.inputPrimitives.pointer!.tap({ x: 200, y: 300 });

    expect(mockState.getWindowsCursorPos()).toEqual({ x: -1000, y: 100 });
    expect(mockState.libnut.moveMouse).not.toHaveBeenCalled();
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledWith('down', 'left');
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledWith('up', 'left');
  });

  it('moves to the reported top-edge target in screenshot coordinates', async () => {
    mockState.setWindowsDisplays([
      {
        id: '\\\\.\\DISPLAY1',
        name: '\\\\.\\DISPLAY1',
        primary: true,
        bounds: { x: 0, y: 0, width: 1600, height: 900 },
      },
    ]);
    const device = await createConnectedDeviceForPlatform('win32');

    await device.inputPrimitives.pointer!.doubleClick({ x: 1395, y: 50 });

    expect(mockState.getWindowsCursorPos()).toEqual({ x: 1395, y: 50 });
    expect(mockState.libnut.moveMouse).not.toHaveBeenCalled();
    expect(mockState.libnut.mouseClick).toHaveBeenCalledWith('left', true);
  });

  it('does not click when screenshot-space pointer verification fails', async () => {
    const device = await createConnectedDeviceForPlatform('win32');
    mockState.setWindowsCursorTransform(() => ({ x: 700, y: 500 }));

    await expect(
      device.inputPrimitives.pointer!.tap({ x: 400, y: 300 }),
    ).rejects.toThrow(/did not reach the tap target/);

    expect(mockState.libnut.mouseToggle).not.toHaveBeenCalled();
    expect(mockState.libnut.mouseClick).not.toHaveBeenCalled();
  });

  it('blocks every pointer-consuming action when Windows pointer drift is detected', async () => {
    const device = await createConnectedDeviceForPlatform('win32');
    const guardedActions = [
      () => device.inputPrimitives.pointer!.doubleClick({ x: 400, y: 300 }),
      () => device.inputPrimitives.pointer!.rightClick({ x: 400, y: 300 }),
      () =>
        device.inputPrimitives.pointer!.dragAndDrop(
          { x: 200, y: 200 },
          { x: 400, y: 300 },
        ),
      () =>
        device.inputPrimitives.keyboard.keyboardPress('Enter', {
          target: { center: [400, 300] },
        }),
      () =>
        device.inputPrimitives.scroll!.scroll({
          scrollType: 'singleAction',
          direction: 'down',
          locate: {
            description: 'scroll target',
            rect: { left: 390, top: 290, width: 20, height: 20 },
            center: [400, 300],
          },
        }),
    ];

    for (const run of guardedActions) {
      mockState.libnut.mouseClick.mockClear();
      mockState.libnut.mouseToggle.mockClear();
      mockState.libnut.scrollMouse.mockClear();
      mockState.libnut.keyTap.mockClear();
      mockState.setWindowsCursorTransform(() => ({ x: 700, y: 500 }));

      await expect(run()).rejects.toThrow(/did not reach/);
      expect(mockState.libnut.mouseClick).not.toHaveBeenCalled();
      expect(mockState.libnut.mouseToggle).not.toHaveBeenCalled();
      expect(mockState.libnut.scrollMouse).not.toHaveBeenCalled();
      expect(mockState.libnut.keyTap).not.toHaveBeenCalled();
    }
  });

  it('sends a press and release for tap after moving to the target', async () => {
    await runPointerTap({ x: 100, y: 120 });

    expect(mockState.libnut.moveMouse).toHaveBeenLastCalledWith(100, 120);
    expect(mockState.libnut.mouseClick).not.toHaveBeenCalled();
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledTimes(2);
    expect(mockState.libnut.mouseToggle).toHaveBeenNthCalledWith(
      1,
      'down',
      'left',
    );
    expect(mockState.libnut.mouseToggle).toHaveBeenNthCalledWith(
      2,
      'up',
      'left',
    );
  });

  it('holds tap until the requested duration elapses', async () => {
    const device = await createConnectedDevice();

    rs.useFakeTimers();
    const tapPromise = device.inputPrimitives.pointer!.tap(
      { x: 100, y: 120 },
      { duration: 250 },
    );

    await rs.advanceTimersByTimeAsync(64);
    expect(mockState.libnut.mouseToggle).not.toHaveBeenCalled();

    await rs.advanceTimersByTimeAsync(50);
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledTimes(1);
    expect(mockState.libnut.mouseToggle).toHaveBeenNthCalledWith(
      1,
      'down',
      'left',
    );

    await rs.advanceTimersByTimeAsync(249);
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledTimes(1);

    await rs.advanceTimersByTimeAsync(1);
    await tapPromise;
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledTimes(2);
    expect(mockState.libnut.mouseToggle).toHaveBeenNthCalledWith(
      2,
      'up',
      'left',
    );
  });

  it('retries tap once when the first click only changes the frontmost app', async () => {
    const device = await createConnectedDevice();
    mockState.execFileSync.mockReset();
    mockState.execFileSync
      .mockReturnValueOnce(Buffer.from('100\tElectron'))
      .mockReturnValueOnce(Buffer.from('200\tSafari'));

    rs.useFakeTimers();
    const tapPromise = device.inputPrimitives.pointer!.tap({
      x: 100,
      y: 120,
    });

    await rs.advanceTimersByTimeAsync(64 + 50 + 100 + 120 + 50 + 100);
    await tapPromise;

    expect(mockState.execFileSync).toHaveBeenCalledTimes(2);
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledTimes(4);
    expect(mockState.libnut.mouseToggle).toHaveBeenNthCalledWith(
      1,
      'down',
      'left',
    );
    expect(mockState.libnut.mouseToggle).toHaveBeenNthCalledWith(
      2,
      'up',
      'left',
    );
    expect(mockState.libnut.mouseToggle).toHaveBeenNthCalledWith(
      3,
      'down',
      'left',
    );
    expect(mockState.libnut.mouseToggle).toHaveBeenNthCalledWith(
      4,
      'up',
      'left',
    );
  });

  it('uses the held tap path when focusing a macOS keyboard target', async () => {
    const device = await createConnectedDevice();

    await device.inputPrimitives.keyboard.keyboardPress('Enter', {
      target: { center: [100, 120] },
    });

    expect(mockState.libnut.mouseClick).not.toHaveBeenCalled();
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledTimes(2);
    expect(mockState.libnut.mouseToggle).toHaveBeenNthCalledWith(
      1,
      'down',
      'left',
    );
    expect(mockState.libnut.mouseToggle).toHaveBeenNthCalledWith(
      2,
      'up',
      'left',
    );
  });
});
