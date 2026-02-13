import { afterEach, describe, expect, it, vi } from 'vitest';
import { VNCClient, VNC_BUTTON } from '../../src/vnc-client';

// Use vi.hoisted so these are available when vi.mock factory runs (hoisted to top)
const { mockInstance, MockVncClient } = vi.hoisted(() => {
  const instance = {
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    sendPointerEvent: vi.fn(),
    sendKeyEvent: vi.fn(),
    clientCutText: vi.fn(),
    requestFrameUpdate: vi.fn(),
    clientWidth: 1920,
    clientHeight: 1080,
    clientName: 'MockVNC',
    fb: Buffer.alloc(1920 * 1080 * 4),
    pixelFormat: {
      bitsPerPixel: 32,
      depth: 24,
      bigEndianFlag: 0,
      trueColorFlag: 1,
      redMax: 255,
      greenMax: 255,
      blueMax: 255,
      redShift: 16,
      greenShift: 8,
      blueShift: 0,
    },
    _securityTypes: {} as Record<number, any>,
  };

  const ctor = vi.fn(() => {
    // Reset per-test state
    instance.on = vi.fn();
    instance.once = vi.fn();
    instance.connect = vi.fn();
    instance._securityTypes = {};
    return instance;
  });

  // Static consts that VNCClient.connect() reads
  (ctor as any).consts = {
    encodings: {
      copyRect: 1,
      zrle: 16,
      hextile: 5,
      raw: 0,
      pseudoDesktopSize: -223,
    },
  };

  return { mockInstance: instance, MockVncClient: ctor };
});

vi.mock('@computernewb/nodejs-rfb', () => ({
  VncClient: MockVncClient,
}));

// Mock sharp since it's a native module
vi.mock('sharp', () => {
  const mockSharp = vi.fn().mockReturnValue({
    png: vi.fn().mockReturnValue({
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-png-data')),
    }),
  });
  return { default: mockSharp };
});

/**
 * Helper: start connect() and fire a specific event handler.
 * connect() does an async dynamic import, so we need to let the microtask
 * queue drain before the event handlers are registered.
 */
async function connectAndFire(
  client: VNCClient,
  event: string,
  ...args: any[]
) {
  const connectPromise = client.connect();

  // Let the async import resolve and event handlers register
  await vi.waitFor(
    () => {
      const handler = mockInstance.on.mock.calls.find(
        (c: any[]) => c[0] === event,
      );
      if (!handler) throw new Error(`Event '${event}' not registered yet`);
    },
    { timeout: 5000, interval: 10 },
  );

  const handler = mockInstance.on.mock.calls.find(
    (c: any[]) => c[0] === event,
  )!;
  handler[1](...args);

  return connectPromise;
}

describe('VNCClient', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default options', () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });
      expect(client).toBeDefined();
      expect(client.isConnected()).toBe(false);
    });

    it('should accept password and timeout options', () => {
      const client = new VNCClient({
        host: '10.0.0.1',
        port: 5901,
        password: 'test',
        connectTimeout: 5000,
        fps: 30,
      });
      expect(client).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should connect and resolve on firstFrameUpdate', async () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });

      await connectAndFire(client, 'firstFrameUpdate');

      expect(client.isConnected()).toBe(true);
    });

    it('should reject on authError', async () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });

      await expect(
        connectAndFire(client, 'authError'),
      ).rejects.toThrow('authentication failed');
    });

    it('should reject on connectError', async () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });

      await expect(
        connectAndFire(client, 'connectError', new Error('ECONNREFUSED')),
      ).rejects.toThrow('ECONNREFUSED');
    });

    it('should pass auth credentials when password provided', async () => {
      const client = new VNCClient({
        host: 'localhost',
        port: 5900,
        password: 'secret',
      });

      await connectAndFire(client, 'firstFrameUpdate');

      // Verify connect was called with auth
      expect(mockInstance.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5900,
          auth: { password: 'secret' },
        }),
      );
    });

    it('should inject ARD security type handler', async () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });

      await connectAndFire(client, 'firstFrameUpdate');

      // The ARD handler (type 30) should be injected
      expect(mockInstance._securityTypes[30]).toBeDefined();
      expect(mockInstance._securityTypes[30].getName()).toBe(
        'Apple Remote Desktop',
      );
    });
  });

  describe('getScreenSize / getServerName', () => {
    it('should return zero size before connect', () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });
      expect(client.getScreenSize()).toEqual({ width: 0, height: 0 });
    });

    it('should return empty server name before connect', () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });
      expect(client.getServerName()).toBe('');
    });
  });

  describe('sendPointerEvent', () => {
    it('should throw if not connected', () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });
      expect(() => client.sendPointerEvent(100, 200, 0)).toThrow(
        'VNC not connected',
      );
    });
  });

  describe('sendKeyEvent', () => {
    it('should throw if not connected', () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });
      expect(() => client.sendKeyEvent(0xff0d, true)).toThrow(
        'VNC not connected',
      );
    });
  });

  describe('disconnect', () => {
    it('should not throw when called before connect', () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });
      expect(() => client.disconnect()).not.toThrow();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('VNC_BUTTON constants', () => {
    it('should have correct button masks', () => {
      expect(VNC_BUTTON.LEFT).toBe(1);
      expect(VNC_BUTTON.MIDDLE).toBe(2);
      expect(VNC_BUTTON.RIGHT).toBe(4);
      expect(VNC_BUTTON.SCROLL_UP).toBe(8);
      expect(VNC_BUTTON.SCROLL_DOWN).toBe(16);
      expect(VNC_BUTTON.SCROLL_LEFT).toBe(32);
      expect(VNC_BUTTON.SCROLL_RIGHT).toBe(64);
    });
  });
});
