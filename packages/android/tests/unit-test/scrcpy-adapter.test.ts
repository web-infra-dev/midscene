import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevicePhysicalInfo } from '../../src/scrcpy-device-adapter';
import { ScrcpyDeviceAdapter } from '../../src/scrcpy-device-adapter';
import { DEFAULT_SCRCPY_CONFIG } from '../../src/scrcpy-manager';

// Mock @yume-chan packages (ESM-only, used via dynamic import in ensureManager)
vi.mock('@yume-chan/adb', () => ({
  Adb: vi.fn().mockImplementation(() => ({})),
  AdbServerClient: vi.fn().mockImplementation(() => ({
    createTransport: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('@yume-chan/adb-server-node-tcp', () => ({
  AdbServerNodeTcpConnector: vi.fn(),
}));

// Mock ScrcpyScreenshotManager returned by dynamic import in ensureManager
const createMockManager = () => ({
  validateEnvironment: vi.fn().mockResolvedValue(undefined),
  ensureConnected: vi.fn().mockResolvedValue(undefined),
  getScreenshotJpeg: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
  getResolution: vi.fn().mockReturnValue(null),
  disconnect: vi.fn().mockResolvedValue(undefined),
});

let currentMockManager: ReturnType<typeof createMockManager>;

vi.mock('../../src/scrcpy-manager', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    ScrcpyScreenshotManager: vi
      .fn()
      .mockImplementation(() => currentMockManager),
  };
});

vi.mock('@midscene/shared/img', () => ({
  createImgBase64ByFormat: vi
    .fn()
    .mockReturnValue('data:image/png;base64,test'),
}));

const defaultDeviceInfo: DevicePhysicalInfo = {
  physicalWidth: 1080,
  physicalHeight: 1920,
  dpr: 2.625,
  orientation: 0,
};

describe('ScrcpyDeviceAdapter', () => {
  beforeEach(() => {
    currentMockManager = createMockManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('should return false by default (DEFAULT_SCRCPY_CONFIG.enabled)', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      expect(adapter.isEnabled()).toBe(false);
      expect(adapter.isEnabled()).toBe(DEFAULT_SCRCPY_CONFIG.enabled);
    });

    it('should return false when config.enabled is false', () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: false },
        undefined,
      );
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should return true when config.enabled is explicitly true', () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: true },
        undefined,
      );
      expect(adapter.isEnabled()).toBe(true);
    });

    it('should return false when initFailed is true', () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: true },
        undefined,
      );
      expect(adapter.isEnabled()).toBe(true);
      (adapter as any).initFailed = true;
      expect(adapter.isEnabled()).toBe(false);
    });
  });

  describe('resolveConfig', () => {
    it('should default maxSize to 0 (no scaling) when not explicitly set', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      const config = adapter.resolveConfig(defaultDeviceInfo);
      expect(config.maxSize).toBe(0);
    });

    it('should default maxSize to 0 regardless of screenshotResizeScale', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, 0.5);
      const config = adapter.resolveConfig(defaultDeviceInfo);
      expect(config.maxSize).toBe(0);
    });

    it('should use explicit maxSize without auto-calculation', () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { maxSize: 1024 },
        undefined,
      );
      const config = adapter.resolveConfig(defaultDeviceInfo);
      expect(config.maxSize).toBe(1024);
    });

    it('should treat maxSize=0 as explicit (no auto-calculation)', () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { maxSize: 0 },
        undefined,
      );
      const config = adapter.resolveConfig(defaultDeviceInfo);
      // maxSize=0 means "no scaling" in scrcpy, should not auto-calculate
      expect(config.maxSize).toBe(0);
    });

    it('should use default videoBitRate regardless of resolution', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      const config = adapter.resolveConfig(defaultDeviceInfo);
      expect(config.idleTimeoutMs).toBe(DEFAULT_SCRCPY_CONFIG.idleTimeoutMs);
      expect(config.videoBitRate).toBe(DEFAULT_SCRCPY_CONFIG.videoBitRate);
    });

    it('should use custom idleTimeoutMs and videoBitRate', () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { idleTimeoutMs: 60000, videoBitRate: 4000000 },
        undefined,
      );
      const config = adapter.resolveConfig(defaultDeviceInfo);
      expect(config.idleTimeoutMs).toBe(60000);
      expect(config.videoBitRate).toBe(4000000);
    });

    it('should cache config (same reference on second call)', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      const config1 = adapter.resolveConfig(defaultDeviceInfo);
      const config2 = adapter.resolveConfig(defaultDeviceInfo);
      expect(config1).toBe(config2);
    });

    it('should use default videoBitRate for high-resolution devices (no auto-scale)', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      const highRes: DevicePhysicalInfo = {
        physicalWidth: 1440,
        physicalHeight: 3120,
        dpr: 3.2,
        orientation: 0,
      };
      const config = adapter.resolveConfig(highRes);
      expect(config.videoBitRate).toBe(DEFAULT_SCRCPY_CONFIG.videoBitRate);
    });

    it('should use explicit videoBitRate for high-resolution devices', () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { videoBitRate: 4_000_000 },
        undefined,
      );
      const highRes: DevicePhysicalInfo = {
        physicalWidth: 1440,
        physicalHeight: 3120,
        dpr: 3.2,
        orientation: 0,
      };
      const config = adapter.resolveConfig(highRes);
      expect(config.videoBitRate).toBe(4_000_000);
    });

    it('should default maxSize to 0 for landscape device', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      const landscape: DevicePhysicalInfo = {
        physicalWidth: 1920,
        physicalHeight: 1080,
        dpr: 2,
        orientation: 1,
      };
      const config = adapter.resolveConfig(landscape);
      expect(config.maxSize).toBe(0);
    });
  });

  describe('getResolution', () => {
    it('should return null when no manager exists', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      expect(adapter.getResolution()).toBeNull();
    });

    it('should delegate to manager.getResolution()', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      currentMockManager.getResolution.mockReturnValue({
        width: 576,
        height: 1024,
      });
      (adapter as any).manager = currentMockManager;
      expect(adapter.getResolution()).toEqual({ width: 576, height: 1024 });
    });

    it('should return null when manager.getResolution() returns null', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      currentMockManager.getResolution.mockReturnValue(null);
      (adapter as any).manager = currentMockManager;
      expect(adapter.getResolution()).toBeNull();
    });
  });

  describe('getSize', () => {
    it('should return null when no manager (no resolution)', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      expect(adapter.getSize(defaultDeviceInfo)).toBeNull();
    });

    it('should return Size with scrcpy resolution and device dpr', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      currentMockManager.getResolution.mockReturnValue({
        width: 576,
        height: 1024,
      });
      (adapter as any).manager = currentMockManager;

      const size = adapter.getSize(defaultDeviceInfo);
      expect(size).toEqual({
        width: 576,
        height: 1024,
        dpr: 2.625,
      });
    });
  });

  describe('getScalingRatio', () => {
    it('should return null when no manager', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      expect(adapter.getScalingRatio(1080)).toBeNull();
    });

    it('should calculate correct scaling ratio', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      currentMockManager.getResolution.mockReturnValue({
        width: 540,
        height: 960,
      });
      (adapter as any).manager = currentMockManager;
      expect(adapter.getScalingRatio(1080)).toBe(0.5);
    });
  });

  describe('ensureManager', () => {
    it('should return cached manager without re-validation', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      (adapter as any).manager = currentMockManager;

      const result = await adapter.ensureManager(defaultDeviceInfo);
      expect(result).toBe(currentMockManager);
      expect(currentMockManager.validateEnvironment).not.toHaveBeenCalled();
    });

    it('should call validateEnvironment once before caching new manager', async () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: true },
        undefined,
      );

      await adapter.ensureManager(defaultDeviceInfo);

      expect(currentMockManager.validateEnvironment).toHaveBeenCalledTimes(1);
      expect((adapter as any).manager).toBe(currentMockManager);
    });

    it('should NOT cache manager when validateEnvironment fails', async () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: true },
        undefined,
      );
      currentMockManager.validateEnvironment.mockRejectedValue(
        new Error('ffmpeg not found'),
      );

      await expect(adapter.ensureManager(defaultDeviceInfo)).rejects.toThrow(
        /Failed to initialize Scrcpy/,
      );
      expect((adapter as any).manager).toBeNull();
    });

    it('should include device ID in error message on failure', async () => {
      const adapter = new ScrcpyDeviceAdapter(
        'my-pixel-6',
        { enabled: true },
        undefined,
      );
      currentMockManager.validateEnvironment.mockRejectedValue(
        new Error('test error'),
      );

      await expect(adapter.ensureManager(defaultDeviceInfo)).rejects.toThrow(
        'my-pixel-6',
      );
    });
  });

  describe('screenshotBase64', () => {
    it('should return base64 image from manager', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      (adapter as any).manager = currentMockManager;

      const result = await adapter.screenshotBase64(defaultDeviceInfo);
      expect(result).toBe('data:image/png;base64,test');
      expect(currentMockManager.getScreenshotJpeg).toHaveBeenCalledTimes(1);
    });
  });

  describe('initialize', () => {
    it('should call ensureManager and manager.ensureConnected', async () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: true },
        undefined,
      );

      await adapter.initialize(defaultDeviceInfo);

      expect(currentMockManager.validateEnvironment).toHaveBeenCalledTimes(1);
      expect(currentMockManager.ensureConnected).toHaveBeenCalledTimes(1);
      expect((adapter as any).manager).toBe(currentMockManager);
    });

    it('should set initFailed=true when ensureManager fails', async () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: true },
        undefined,
      );
      currentMockManager.validateEnvironment.mockRejectedValue(
        new Error('ffmpeg not found'),
      );

      await expect(adapter.initialize(defaultDeviceInfo)).rejects.toThrow();
      expect((adapter as any).initFailed).toBe(true);
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should set initFailed=true when ensureConnected fails', async () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: true },
        undefined,
      );
      currentMockManager.ensureConnected.mockRejectedValue(
        new Error('scrcpy connection failed'),
      );

      await expect(adapter.initialize(defaultDeviceInfo)).rejects.toThrow(
        'scrcpy connection failed',
      );
      expect((adapter as any).initFailed).toBe(true);
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should not set initFailed on success', async () => {
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: true },
        undefined,
      );

      await adapter.initialize(defaultDeviceInfo);

      expect((adapter as any).initFailed).toBe(false);
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should clear manager and resolvedConfig', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      (adapter as any).manager = currentMockManager;
      adapter.resolveConfig(defaultDeviceInfo); // populate cache

      await adapter.disconnect();

      expect((adapter as any).manager).toBeNull();
      expect((adapter as any).resolvedConfig).toBeNull();
      expect(currentMockManager.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle disconnect errors gracefully (no throw)', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      (adapter as any).manager = currentMockManager;
      currentMockManager.disconnect.mockRejectedValue(
        new Error('disconnect failed'),
      );

      await expect(adapter.disconnect()).resolves.toBeUndefined();
      expect((adapter as any).manager).toBeNull();
    });

    it('should be no-op when no manager exists', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined, undefined);
      await expect(adapter.disconnect()).resolves.toBeUndefined();
    });
  });
});
