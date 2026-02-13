import { afterEach, describe, expect, it, vi } from 'vitest';
import { VNCAgent } from '../../src/agent';
import { VNCDevice } from '../../src/device';

// Mock VNCClient at the source level
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
    getScreenSize: vi.fn().mockReturnValue({ width: 1024, height: 768 }),
    getServerName: vi.fn().mockReturnValue('Test Server'),
  }));

  return { VNCClient, VNC_BUTTON };
});

describe('VNCAgent', () => {
  const defaultOpts = { host: 'localhost', port: 5900 };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create agent with device', () => {
    const device = new VNCDevice(defaultOpts);
    const agent = new VNCAgent(device);

    expect(agent).toBeDefined();
    expect(agent.interface).toBe(device);
  });

  it('should create agent with options', () => {
    const device = new VNCDevice(defaultOpts);
    const agent = new VNCAgent(device, {
      aiActionContext: 'Remote Linux desktop via VNC',
    });

    expect(agent).toBeDefined();
  });

  it('should create agent with custom actions', () => {
    const device = new VNCDevice({
      ...defaultOpts,
      customActions: [],
    });
    const agent = new VNCAgent(device);

    expect(agent).toBeDefined();
    expect(agent.interface).toBeDefined();
  });
});
