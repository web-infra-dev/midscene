import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VNCDevice } from '../../src/device';
import { VNCClient } from '../../src/vnc-client';

// Mock the VNCClient so tests don't need a real VNC server
vi.mock('../../src/vnc-client', () => {
  const VNC_BUTTON = {
    LEFT: 1,
    MIDDLE: 2,
    RIGHT: 4,
    SCROLL_UP: 8,
    SCROLL_DOWN: 16,
    SCROLL_LEFT: 32,
    SCROLL_RIGHT: 64,
  };

  const VNCClient = vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    sendPointerEvent: vi.fn(),
    sendKeyEvent: vi.fn(),
    clientCutText: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
    getScreenSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
    getServerName: vi.fn().mockReturnValue('Test VNC Server'),
  }));

  return { VNCClient, VNC_BUTTON };
});

describe('VNCDevice', () => {
  const defaultOpts = { host: '192.168.1.100', port: 5900 };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create device instance', () => {
    const device = new VNCDevice(defaultOpts);
    expect(device).toBeDefined();
    expect(device.interfaceType).toBe('vnc');
  });

  it('should create device with password', () => {
    const device = new VNCDevice({
      ...defaultOpts,
      password: 'secret',
    });
    expect(device).toBeDefined();
  });

  it('should return description before connect', () => {
    const device = new VNCDevice(defaultOpts);
    expect(device.describe()).toBe('VNC Remote Device');
  });

  it('should connect and update description', async () => {
    const device = new VNCDevice(defaultOpts);
    await device.connect();

    const desc = device.describe();
    expect(desc).toContain('VNC Remote Desktop');
    expect(desc).toContain('192.168.1.100:5900');
    expect(desc).toContain('Test VNC Server');
    expect(desc).toContain('1920x1080');
  });

  it('should return screen size', async () => {
    const device = new VNCDevice(defaultOpts);
    await device.connect();

    const size = await device.size();
    expect(size).toEqual({ width: 1920, height: 1080, dpr: 1 });
  });

  it('should return vnc:// url', async () => {
    const device = new VNCDevice(defaultOpts);
    const url = await device.url();
    expect(url).toBe('vnc://192.168.1.100:5900');
  });

  it('should have complete action space', () => {
    const device = new VNCDevice(defaultOpts);
    const actions = device.actionSpace();

    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);

    const actionNames = actions.map((a) => a.name);
    expect(actionNames).toContain('Tap');
    expect(actionNames).toContain('DoubleClick');
    expect(actionNames).toContain('RightClick');
    expect(actionNames).toContain('MouseMove');
    expect(actionNames).toContain('Input');
    expect(actionNames).toContain('Scroll');
    expect(actionNames).toContain('KeyboardPress');
    expect(actionNames).toContain('DragAndDrop');
    expect(actionNames).toContain('ClearInput');
  });

  it('should include custom actions', () => {
    const customAction = {
      name: 'CustomAction',
      description: 'A custom action',
      call: vi.fn(),
    };
    const device = new VNCDevice({
      ...defaultOpts,
      customActions: [customAction],
    });
    const actions = device.actionSpace();
    const names = actions.map((a) => a.name);
    expect(names).toContain('CustomAction');
  });

  it('should destroy only once', async () => {
    const device = new VNCDevice(defaultOpts);
    await device.destroy();
    await device.destroy(); // second call should be no-op
  });
});
