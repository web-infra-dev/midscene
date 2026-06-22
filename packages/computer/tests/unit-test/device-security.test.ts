import type { ExecutorContext } from '@midscene/core';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';

const mockState = rs.hoisted(() => {
  const execSync = rs.fn();
  const execFileSync = rs.fn();

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
    execSync.mockReset();
    execFileSync.mockReset();
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

  return {
    execSync,
    execFileSync,
    screenshot,
    libnut,
    createRequire,
    reset,
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

    expect(mockState.libnut.moveMouse).toHaveBeenCalledWith(400, 300);
    expect(mockState.libnut.focusWindow).not.toHaveBeenCalled();
    expect(mockState.libnut.mouseClick).not.toHaveBeenCalled();
    expect(mockState.libnut.scrollMouse).toHaveBeenCalled();
  });

  it('focuses and anchors untargeted Windows scrolls at the active window center', async () => {
    const device = await createConnectedDeviceForPlatform('win32');
    mockState.libnut.getActiveWindow.mockReturnValue(123);
    mockState.libnut.getWindowRect.mockReturnValue({
      x: 40,
      y: 80,
      width: 360,
      height: 500,
    });

    await device.inputPrimitives.scroll!.scroll({
      scrollType: 'singleAction',
      direction: 'down',
    });

    expect(mockState.libnut.getWindowRect).toHaveBeenCalledWith(123);
    expect(mockState.libnut.focusWindow).toHaveBeenCalledWith(123);
    expect(mockState.libnut.moveMouse).toHaveBeenCalledWith(220, 330);
    expect(mockState.libnut.mouseClick).not.toHaveBeenCalled();
    expect(mockState.libnut.scrollMouse).toHaveBeenCalled();
  });
});

describe('ComputerDevice pointer input', () => {
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
});
