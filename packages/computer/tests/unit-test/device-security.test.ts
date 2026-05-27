import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const execSync = vi.fn();
  const execFileSync = vi.fn();

  const screenshot = vi.fn(async () => Buffer.from('png')) as ReturnType<
    typeof vi.fn
  > & {
    listDisplays: ReturnType<typeof vi.fn>;
  };
  screenshot.listDisplays = vi.fn(async () => [
    { id: 1, name: 'Display 1', primary: true },
  ]);

  let mousePos = { x: 10, y: 20 };
  const libnut = {
    getScreenSize: vi.fn(() => ({ width: 800, height: 600 })),
    getMousePos: vi.fn(() => ({ ...mousePos })),
    moveMouse: vi.fn((x: number, y: number) => {
      mousePos = { x, y };
    }),
    mouseClick: vi.fn(),
    mouseToggle: vi.fn(),
    scrollMouse: vi.fn(),
    keyTap: vi.fn(),
    typeString: vi.fn(),
  };

  const createRequire = vi.fn(() =>
    vi.fn(() => ({
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

vi.mock('node:child_process', () => ({
  execSync: mockState.execSync,
  execFileSync: mockState.execFileSync,
}));

vi.mock('screenshot-desktop', () => ({
  default: mockState.screenshot,
}));

vi.mock('node:module', () => ({
  createRequire: mockState.createRequire,
}));

const originalPlatform = process.platform;

beforeEach(() => {
  mockState.reset();
  Object.defineProperty(process, 'platform', { value: 'darwin' });
});

afterEach(() => {
  vi.resetModules();
  Object.defineProperty(process, 'platform', { value: originalPlatform });
});

async function runKeyboardPress(keyName: string): Promise<void> {
  const { ComputerDevice } = await import('../../src/device');
  const device = new ComputerDevice({});
  await device.connect();

  const keyboardPress = device
    .actionSpace()
    .find((action) => action.name === 'KeyboardPress');

  expect(keyboardPress).toBeDefined();
  await keyboardPress!.call({ keyName });
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

    await vi.waitFor(() => {
      expect(mockState.libnut.mouseToggle).toHaveBeenCalledWith('down', 'left');
    });

    await device.destroy();

    await expect(tapPromise).rejects.toThrow(/destroyed/);
    expect(mockState.libnut.mouseToggle).toHaveBeenCalledWith('up', 'left');
  });
});
