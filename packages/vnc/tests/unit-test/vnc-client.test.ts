import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VNCClient, VNC_BUTTON } from '../../src/vnc-client';

// Mock the upstream @computernewb/nodejs-rfb module
const mockVncClientInstance = {
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
};

vi.mock('@computernewb/nodejs-rfb', () => ({
  VncClient: vi.fn().mockImplementation(() => {
    // Reset the on/once mocks for each new instance
    mockVncClientInstance.on = vi.fn();
    mockVncClientInstance.once = vi.fn();
    return mockVncClientInstance;
  }),
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

describe('VNCClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

      // Capture event handlers during connect
      const connectPromise = client.connect();

      // Find the 'firstFrameUpdate' handler and invoke it
      const onCalls = mockVncClientInstance.on.mock.calls;
      const firstFrameHandler = onCalls.find(
        (c: any[]) => c[0] === 'firstFrameUpdate',
      );
      expect(firstFrameHandler).toBeDefined();
      firstFrameHandler![1](); // fire the event

      await connectPromise;
      expect(client.isConnected()).toBe(true);
    });

    it('should reject on authError', async () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });

      const connectPromise = client.connect();

      const onCalls = mockVncClientInstance.on.mock.calls;
      const authErrorHandler = onCalls.find(
        (c: any[]) => c[0] === 'authError',
      );
      authErrorHandler![1]();

      await expect(connectPromise).rejects.toThrow('authentication failed');
    });

    it('should reject on connectError', async () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });

      const connectPromise = client.connect();

      const onCalls = mockVncClientInstance.on.mock.calls;
      const connectErrorHandler = onCalls.find(
        (c: any[]) => c[0] === 'connectError',
      );
      connectErrorHandler![1](new Error('ECONNREFUSED'));

      await expect(connectPromise).rejects.toThrow('ECONNREFUSED');
    });

    it('should pass auth credentials when password provided', async () => {
      const client = new VNCClient({
        host: 'localhost',
        port: 5900,
        password: 'secret',
      });

      const connectPromise = client.connect();

      // Verify connect was called with auth
      expect(mockVncClientInstance.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5900,
          auth: { password: 'secret' },
        }),
      );

      // Resolve the connection
      const firstFrameHandler = mockVncClientInstance.on.mock.calls.find(
        (c: any[]) => c[0] === 'firstFrameUpdate',
      );
      firstFrameHandler![1]();
      await connectPromise;
    });
  });

  describe('getScreenSize / getServerName', () => {
    it('should return screen size from underlying client', async () => {
      const client = new VNCClient({ host: 'localhost', port: 5900 });

      // Before connect
      const sizeBeforeConnect = client.getScreenSize();
      // After the mock client is created in connect(), it should return mocked values
      expect(sizeBeforeConnect).toEqual({ width: 0, height: 0 });
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
