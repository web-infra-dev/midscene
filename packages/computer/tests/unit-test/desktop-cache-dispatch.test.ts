import type { ElementCacheFeature } from '@midscene/core';
import type { UiNode } from '@midscene/core/internal/device-cache';
import { MIDSCENE_EXPERIMENTAL_NATIVE_XPATH_CACHE } from '@midscene/shared/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const tree = (type: string, attr: string, value: string): UiNode => ({
    type: `${type}Window`,
    attrs: {},
    bounds: { left: 0, top: 0, width: 800, height: 600 },
    children: [
      {
        type: `${type}Button`,
        attrs: { [attr]: value, Name: 'Cache target' },
        bounds: { left: 100, top: 80, width: 120, height: 40 },
        children: [],
      },
    ],
  });

  const readDarwinAccessibilityTree = vi.fn(async () =>
    tree('AX', 'AXIdentifier', 'darwin-target'),
  );
  const readWindowsAccessibilityTree = vi.fn(async () =>
    tree('UIA', 'AutomationId', 'windows-target'),
  );
  const readLinuxAccessibilityTree = vi.fn(async () =>
    tree('ATSPI', 'AccessibleId', 'linux-target'),
  );

  const screenshot = vi.fn(async () => Buffer.from('fake-png')) as ReturnType<
    typeof vi.fn
  > & {
    listDisplays: ReturnType<typeof vi.fn>;
  };
  screenshot.listDisplays = vi.fn(async () => [
    {
      id: 'DP-1',
      name: 'DP-1',
      primary: true,
      offsetX: 0,
      offsetY: 0,
    },
    {
      id: 'DP-2',
      name: 'DP-2',
      primary: false,
      offsetX: 1920,
      offsetY: -120,
    },
  ]);

  let mouse = { x: 10, y: 20 };
  const libnut = {
    getScreenSize: vi.fn(() => ({ width: 800, height: 600 })),
    getMousePos: vi.fn(() => ({ ...mouse })),
    moveMouse: vi.fn((x: number, y: number) => {
      mouse = { x, y };
    }),
    mouseClick: vi.fn(),
    mouseToggle: vi.fn(),
    scrollMouse: vi.fn(),
    keyTap: vi.fn(),
    typeString: vi.fn(),
    getActiveWindow: vi.fn(() => 4242),
    getWindowRect: vi.fn(),
    focusWindow: vi.fn(),
  };
  const requireFn = vi.fn(() => ({ libnut }));
  const createRequire = vi.fn(() => requireFn);

  const reset = () => {
    mouse = { x: 10, y: 20 };
    readDarwinAccessibilityTree.mockClear();
    readWindowsAccessibilityTree.mockClear();
    readLinuxAccessibilityTree.mockClear();
    screenshot.mockClear();
    screenshot.listDisplays.mockClear();
    libnut.getActiveWindow.mockReset();
    libnut.getActiveWindow.mockReturnValue(4242);
    libnut.moveMouse.mockClear();
    createRequire.mockClear();
    requireFn.mockClear();
  };

  return {
    createRequire,
    libnut,
    readDarwinAccessibilityTree,
    readLinuxAccessibilityTree,
    readWindowsAccessibilityTree,
    reset,
    screenshot,
  };
});

vi.mock('../../src/darwin-accessibility-tree', () => ({
  readDarwinAccessibilityTree: mockState.readDarwinAccessibilityTree,
}));

vi.mock('../../src/windows-accessibility-tree', () => ({
  readWindowsAccessibilityTree: mockState.readWindowsAccessibilityTree,
}));

vi.mock('../../src/linux-accessibility-tree', () => ({
  readLinuxAccessibilityTree: mockState.readLinuxAccessibilityTree,
}));

vi.mock('screenshot-desktop', () => ({
  default: mockState.screenshot,
}));

vi.mock('node:module', () => ({
  createRequire: mockState.createRequire,
}));

const originalPlatform = process.platform;

function firstXpath(feature: ElementCacheFeature): string {
  if (!Array.isArray(feature.xpaths) || typeof feature.xpaths[0] !== 'string') {
    throw new Error('Expected an xpath cache feature');
  }
  return feature.xpaths[0];
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform });
}

async function createConnectedDevice(displayId?: string) {
  setPlatform('linux');
  const { ComputerDevice } = await import('../../src/device');
  const device = new ComputerDevice({ displayId });
  await device.connect();
  return device;
}

beforeEach(() => {
  vi.stubEnv(MIDSCENE_EXPERIMENTAL_NATIVE_XPATH_CACHE, '1');
  mockState.reset();
});

afterEach(() => {
  setPlatform(originalPlatform);
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('ComputerDevice desktop xpath cache dispatch', () => {
  it('does not read accessibility trees when native xpath cache is disabled', async () => {
    const device = await createConnectedDevice();
    vi.stubEnv(MIDSCENE_EXPERIMENTAL_NATIVE_XPATH_CACHE, '0');

    await expect(device.cacheFeatureForPoint([150, 100])).resolves.toEqual({});
    await expect(device.rectMatchesCacheFeature({})).rejects.toThrow(
      'Native XPath cache is disabled',
    );
    expect(mockState.readDarwinAccessibilityTree).not.toHaveBeenCalled();
    expect(mockState.readWindowsAccessibilityTree).not.toHaveBeenCalled();
    expect(mockState.readLinuxAccessibilityTree).not.toHaveBeenCalled();
    await device.destroy();
  });

  it('uses the Windows active HWND and UIA attributes', async () => {
    const device = await createConnectedDevice();
    setPlatform('win32');

    const feature = await device.cacheFeatureForPoint([150, 100]);

    expect(mockState.readWindowsAccessibilityTree).toHaveBeenCalledWith({
      windowHandle: 4242,
      displayId: undefined,
    });
    expect(firstXpath(feature)).toBe("//*[@AutomationId='windows-target']");
    expect(feature.target).toEqual({
      type: 'UIAButton',
      attr: 'AutomationId',
      value: 'windows-target',
    });
    await device.destroy();
  });

  it('skips order-sensitive targets before reading the hierarchy', async () => {
    const device = await createConnectedDevice();
    setPlatform('win32');

    await expect(
      device.cacheFeatureForPoint([80, 120], { orderSensitive: true }),
    ).resolves.toEqual({});
    expect(mockState.readWindowsAccessibilityTree).not.toHaveBeenCalled();
    await device.destroy();
  });

  it('maps Linux AT-SPI screen coordinates to the selected display', async () => {
    const device = await createConnectedDevice('DP-2');

    const feature = await device.cacheFeatureForPoint([150, 100]);

    expect(mockState.readLinuxAccessibilityTree).toHaveBeenCalledWith({
      displayOffset: { x: 1920, y: -120 },
    });
    expect(firstXpath(feature)).toBe("//*[@AccessibleId='linux-target']");
    await expect(device.rectMatchesCacheFeature(feature)).resolves.toEqual({
      left: 100,
      top: 80,
      width: 120,
      height: 40,
    });
    await device.destroy();
  });

  it('keeps the existing macOS accessibility reader path', async () => {
    const device = await createConnectedDevice();
    setPlatform('darwin');

    const feature = await device.cacheFeatureForPoint([150, 100]);

    expect(mockState.readDarwinAccessibilityTree).toHaveBeenCalledOnce();
    expect(firstXpath(feature)).toBe("//*[@AXIdentifier='darwin-target']");
    await device.destroy();
  });

  it('does not cache a macOS window when its inner target is not exposed', async () => {
    const device = await createConnectedDevice();
    setPlatform('darwin');
    mockState.readDarwinAccessibilityTree.mockResolvedValueOnce({
      type: 'AXApplication',
      attrs: { AXName: 'cmux' },
      bounds: { left: 0, top: 0, width: 0, height: 0 },
      children: [
        {
          type: 'AXWindow',
          attrs: { AXName: 'cmux' },
          bounds: { left: 0, top: 0, width: 800, height: 600 },
          children: [],
        },
      ],
    });

    await expect(device.cacheFeatureForPoint([150, 100])).resolves.toEqual({});
    await device.destroy();
  });

  it('does not cache a Windows window when its inner target is not exposed', async () => {
    const device = await createConnectedDevice();
    setPlatform('win32');
    mockState.readWindowsAccessibilityTree.mockResolvedValueOnce({
      type: 'UIAWindow',
      attrs: { Name: 'Settings' },
      bounds: { left: 0, top: 0, width: 800, height: 600 },
      children: [],
    });

    await expect(device.cacheFeatureForPoint([150, 100])).resolves.toEqual({});
    await device.destroy();
  });

  it('does not cache a Linux window when its inner target is not exposed', async () => {
    const device = await createConnectedDevice();
    mockState.readLinuxAccessibilityTree.mockResolvedValueOnce({
      type: 'ATSPIApplication',
      attrs: { Name: 'Demo' },
      bounds: { left: 0, top: 0, width: 0, height: 0 },
      children: [
        {
          type: 'ATSPIFrame',
          attrs: { Name: 'Demo window' },
          bounds: { left: 0, top: 0, width: 800, height: 600 },
          children: [],
        },
      ],
    });

    await expect(device.cacheFeatureForPoint([150, 100])).resolves.toEqual({});
    await device.destroy();
  });

  it('throws when Windows has no active window handle', async () => {
    const device = await createConnectedDevice();
    mockState.libnut.getActiveWindow.mockReturnValue(0);
    setPlatform('win32');

    await expect(device.cacheFeatureForPoint([150, 100])).rejects.toThrow(
      'no active window handle',
    );
    expect(mockState.readWindowsAccessibilityTree).not.toHaveBeenCalled();
    await device.destroy();
  });

  it('propagates Linux reader failures to the optional cache caller', async () => {
    const device = await createConnectedDevice();
    mockState.readLinuxAccessibilityTree.mockRejectedValueOnce(
      new Error('AT-SPI bus unavailable'),
    );

    await expect(device.cacheFeatureForPoint([150, 100])).rejects.toThrow(
      'AT-SPI bus unavailable',
    );
    await device.destroy();
  });

  it('keeps unsupported platforms explicit', async () => {
    const device = await createConnectedDevice();
    setPlatform('aix');

    await expect(device.cacheFeatureForPoint([150, 100])).resolves.toEqual({});
    await expect(device.rectMatchesCacheFeature({})).rejects.toThrow(
      'not supported on aix',
    );
    await device.destroy();
  });
});
