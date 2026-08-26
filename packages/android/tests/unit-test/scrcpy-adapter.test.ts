import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import type { DevicePhysicalInfo } from '../../src/scrcpy-device-adapter';
import {
  ScrcpyDeviceAdapter,
  formatScrcpyFreshFrameFailure,
} from '../../src/scrcpy-device-adapter';
import {
  DEFAULT_SCRCPY_CONFIG,
  SCRCPY_FRESH_FRAME_UNAVAILABLE_ERROR_CODE,
  ScrcpyFreshFrameUnavailableError,
  ScrcpyScreenshotManager,
} from '../../src/scrcpy-manager';
import * as scrcpyManagerActual from '../../src/scrcpy-manager' with {
  rstest: 'importActual',
};

const mocks = rs.hoisted(() => {
  const fileTransferPush = rs.fn().mockResolvedValue(undefined);
  return {
    AdbServerNodeTcpConnector: rs.fn(),
    createTransport: rs.fn().mockResolvedValue({}),
    fileTransferPush,
    AppiumAdb: rs.fn().mockImplementation(() => ({
      push: fileTransferPush,
    })),
  };
});

rs.mock('appium-adb', () => ({ ADB: mocks.AppiumAdb }));

// Mock @yume-chan packages (ESM-only, used via dynamic import in ensureManager)
rs.mock('@yume-chan/adb', () => ({
  Adb: rs.fn().mockImplementation(() => ({})),
  AdbServerClient: rs.fn().mockImplementation(() => ({
    createTransport: mocks.createTransport,
  })),
}));

rs.mock('@yume-chan/adb-server-node-tcp', () => ({
  AdbServerNodeTcpConnector: mocks.AdbServerNodeTcpConnector,
}));

// Mock ScrcpyScreenshotManager returned by dynamic import in ensureManager
const createMockManager = () => ({
  validateEnvironment: rs.fn().mockResolvedValue(undefined),
  ensureConnected: rs.fn().mockResolvedValue(undefined),
  ensureFrameClockCalibration: rs.fn().mockResolvedValue(undefined),
  setFreshnessBarrier: rs.fn().mockResolvedValue(1_000_000n),
  subscribeKeyframes: rs.fn().mockReturnValue(rs.fn()),
  getLatestRawKeyframe: rs.fn().mockReturnValue(null),
  decodeRawKeyframeToJpeg: rs.fn().mockResolvedValue(Buffer.from('jpeg')),
  isConnected: rs.fn().mockReturnValue(false),
  getScreenshotJpeg: rs.fn().mockResolvedValue(Buffer.from('fake-png')),
  getResolution: rs.fn().mockReturnValue(null),
  disconnect: rs.fn().mockResolvedValue(undefined),
  dispose: rs.fn().mockResolvedValue(undefined),
});

let currentMockManager: ReturnType<typeof createMockManager>;

rs.mock('../../src/scrcpy-manager', () => ({
  ...scrcpyManagerActual,
  ScrcpyScreenshotManager: rs.fn().mockImplementation(() => currentMockManager),
}));

rs.mock('@midscene/shared/img', () => ({
  createImgBase64ByFormat: rs
    .fn()
    .mockReturnValue('data:image/png;base64,test'),
}));

const defaultDeviceInfo: DevicePhysicalInfo = {
  physicalWidth: 1080,
  physicalHeight: 1920,
  dpr: 2.625,
  orientation: 0,
};

const createFreshnessError = (
  message: string,
  options: {
    failureKind?: 'stream-startup' | 'freshness-target';
    timeoutMs?: number;
    videoBitRate?: number;
  } = {},
) =>
  new ScrcpyFreshFrameUnavailableError(message, {
    failureKind: options.failureKind ?? 'freshness-target',
    timeoutMs: options.timeoutMs ?? 300,
    videoBitRate: options.videoBitRate ?? 4_000_000,
  });

describe('ScrcpyDeviceAdapter', () => {
  beforeEach(() => {
    currentMockManager = createMockManager();
  });

  afterEach(() => {
    rs.useRealTimers();
    rs.clearAllMocks();
  });

  describe('isEnabled', () => {
    it('should return false by default (DEFAULT_SCRCPY_CONFIG.enabled)', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      expect(adapter.isEnabled()).toBe(false);
      expect(adapter.isEnabled()).toBe(DEFAULT_SCRCPY_CONFIG.enabled);
    });

    it('should return false when config.enabled is false', () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: false });
      expect(adapter.isEnabled()).toBe(false);
    });

    it('should return true when config.enabled is explicitly true', () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should distinguish disabled configuration from runtime connection state', () => {
      const disabled = new ScrcpyDeviceAdapter('device', { enabled: false });
      expect(disabled.getStatus()).toEqual({
        enabled: false,
        connected: false,
        lastError: null,
        retryAfter: null,
      });

      const enabled = new ScrcpyDeviceAdapter('device', { enabled: true });
      (enabled as any).manager = currentMockManager;
      currentMockManager.isConnected.mockReturnValue(true);
      expect(enabled.getStatus()).toEqual({
        enabled: true,
        connected: true,
        lastError: null,
        retryAfter: null,
      });
    });
  });

  describe('resolveConfig', () => {
    it('should default maxSize to 0 (no scaling) when not explicitly set', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      const config = adapter.resolveConfig();
      expect(config.maxSize).toBe(0);
    });

    it('should use explicit maxSize without auto-calculation', () => {
      const adapter = new ScrcpyDeviceAdapter('device', { maxSize: 1024 });
      const config = adapter.resolveConfig();
      expect(config.maxSize).toBe(1024);
    });

    it('should treat maxSize=0 as explicit (no auto-calculation)', () => {
      const adapter = new ScrcpyDeviceAdapter('device', { maxSize: 0 });
      const config = adapter.resolveConfig();
      // maxSize=0 means "no scaling" in scrcpy, should not auto-calculate
      expect(config.maxSize).toBe(0);
    });

    it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN])(
      'should reject invalid maxSize %s',
      (maxSize) => {
        const adapter = new ScrcpyDeviceAdapter('device', { maxSize });
        expect(() => adapter.resolveConfig()).toThrow(
          'Invalid scrcpyConfig.maxSize: expected a non-negative integer',
        );
      },
    );

    it('should use the default videoBitRate when not explicitly configured', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      const config = adapter.resolveConfig();
      expect(config.idleTimeoutMs).toBe(DEFAULT_SCRCPY_CONFIG.idleTimeoutMs);
      expect(config.videoBitRate).toBe(DEFAULT_SCRCPY_CONFIG.videoBitRate);
    });

    it.each(['10.84.162.47:36967', '127.0.0.1:5555', 'device:5555'])(
      'should not infer videoBitRate from the device endpoint %s',
      (deviceId) => {
        const adapter = new ScrcpyDeviceAdapter(deviceId, undefined);
        const config = adapter.resolveConfig();
        expect(config.videoBitRate).toBe(DEFAULT_SCRCPY_CONFIG.videoBitRate);
      },
    );

    it('should honor an explicit bitrate on a remote device endpoint', () => {
      const adapter = new ScrcpyDeviceAdapter('10.84.162.47:36967', {
        videoBitRate: 8_000_000,
      });
      const config = adapter.resolveConfig();
      expect(config.videoBitRate).toBe(8_000_000);
    });

    it('should use custom idleTimeoutMs and videoBitRate', () => {
      const adapter = new ScrcpyDeviceAdapter('device', {
        idleTimeoutMs: 60000,
        videoBitRate: 4000000,
      });
      const config = adapter.resolveConfig();
      expect(config.idleTimeoutMs).toBe(60000);
      expect(config.videoBitRate).toBe(4000000);
    });

    it('should cache config (same reference on second call)', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      const config1 = adapter.resolveConfig();
      const config2 = adapter.resolveConfig();
      expect(config1).toBe(config2);
    });

    it('should accept legacy device info without inferring config values', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      const config = adapter.resolveConfig(defaultDeviceInfo);

      expect(config.maxSize).toBe(DEFAULT_SCRCPY_CONFIG.maxSize);
      expect(config.videoBitRate).toBe(DEFAULT_SCRCPY_CONFIG.videoBitRate);
    });
  });

  describe('getResolution', () => {
    it('should return null when no manager exists', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      expect(adapter.getResolution()).toBeNull();
    });

    it('should delegate to manager.getResolution()', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      currentMockManager.getResolution.mockReturnValue({
        width: 576,
        height: 1024,
      });
      (adapter as any).manager = currentMockManager;
      expect(adapter.getResolution()).toEqual({ width: 576, height: 1024 });
    });

    it('should return null when manager.getResolution() returns null', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      currentMockManager.getResolution.mockReturnValue(null);
      (adapter as any).manager = currentMockManager;
      expect(adapter.getResolution()).toBeNull();
    });
  });

  describe('getSize', () => {
    it('should return null when no manager (no resolution)', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      expect(adapter.getSize(defaultDeviceInfo)).toBeNull();
    });

    it('should return Size with scrcpy resolution', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      currentMockManager.getResolution.mockReturnValue({
        width: 576,
        height: 1024,
      });
      (adapter as any).manager = currentMockManager;

      const size = adapter.getSize(defaultDeviceInfo);
      expect(size).toEqual({
        width: 576,
        height: 1024,
      });
    });
  });

  describe('getScalingRatio', () => {
    it('should return null when no manager', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      expect(adapter.getScalingRatio(1080)).toBeNull();
    });

    it('should calculate correct scaling ratio', () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      currentMockManager.getResolution.mockReturnValue({
        width: 540,
        height: 960,
      });
      (adapter as any).manager = currentMockManager;
      expect(adapter.getScalingRatio(1080)).toBe(0.5);
    });
  });

  describe('ensureManager', () => {
    it('should use the local ADB server endpoint by default', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });

      await adapter.ensureManager(defaultDeviceInfo);

      expect(mocks.AdbServerNodeTcpConnector).toHaveBeenCalledWith({
        host: '127.0.0.1',
        port: 5037,
      });
      expect(mocks.createTransport).toHaveBeenCalledWith({ serial: 'device' });
    });

    it('should connect to the resolved ADB server endpoint', async () => {
      const resolveAdbServerEndpoint = rs.fn().mockResolvedValue({
        host: '192.168.1.10',
        port: 5038,
      });
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: true },
        resolveAdbServerEndpoint,
      );

      await adapter.ensureManager(defaultDeviceInfo);

      expect(resolveAdbServerEndpoint).toHaveBeenCalledTimes(1);
      expect(mocks.AdbServerNodeTcpConnector).toHaveBeenCalledWith({
        host: '192.168.1.10',
        port: 5038,
      });
    });

    it('should forward a configured scrcpy server pusher to the manager', async () => {
      const pushServer = rs.fn().mockResolvedValue(undefined);
      const adapter = new ScrcpyDeviceAdapter(
        'device',
        { enabled: true },
        () => ({ host: '127.0.0.1', port: 5037, pushServer }),
      );

      await adapter.ensureManager(defaultDeviceInfo);

      const [, options, managerPusher] = rs.mocked(ScrcpyScreenshotManager).mock
        .calls[0];
      expect(options).not.toHaveProperty('pushServer');
      expect(managerPusher).toBe(pushServer);
    });

    it('should create an external ADB server pusher by default', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });

      await adapter.ensureManager(defaultDeviceInfo);

      const [, , pushServer] = rs.mocked(ScrcpyScreenshotManager).mock.calls[0];
      if (!pushServer) {
        throw new Error('Expected the manager to receive a server pusher');
      }
      await pushServer('/tmp/scrcpy-server', '/data/local/tmp/scrcpy-server');

      expect(mocks.AppiumAdb).toHaveBeenCalledWith({
        udid: 'device',
        remoteAdbHost: '127.0.0.1',
        remoteAdbPort: 5037,
      });
      expect(mocks.fileTransferPush).toHaveBeenCalledWith(
        '/tmp/scrcpy-server',
        '/data/local/tmp/scrcpy-server',
      );
    });

    it('should return cached manager without re-validation', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      (adapter as any).manager = currentMockManager;

      const result = await adapter.ensureManager(defaultDeviceInfo);
      expect(result).toBe(currentMockManager);
      expect(currentMockManager.validateEnvironment).not.toHaveBeenCalled();
    });

    it('should call validateEnvironment once before caching new manager', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });

      await adapter.ensureManager(defaultDeviceInfo);

      expect(currentMockManager.validateEnvironment).toHaveBeenCalledTimes(1);
      expect((adapter as any).manager).toBe(currentMockManager);
    });

    it('should NOT cache manager when validateEnvironment fails', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      currentMockManager.validateEnvironment.mockRejectedValue(
        new Error('ffmpeg not found'),
      );

      await expect(adapter.ensureManager(defaultDeviceInfo)).rejects.toThrow(
        /Failed to initialize Scrcpy/,
      );
      expect((adapter as any).manager).toBeNull();
    });

    it('should include device ID in error message on failure', async () => {
      const adapter = new ScrcpyDeviceAdapter('my-pixel-6', { enabled: true });
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
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      (adapter as any).manager = currentMockManager;

      const result = await adapter.screenshotBase64(defaultDeviceInfo);
      expect(result).toBe('data:image/png;base64,test');
      expect(currentMockManager.getScreenshotJpeg).toHaveBeenCalledTimes(1);
    });
  });

  describe('frame freshness barriers', () => {
    it('does not discard an already valid frame when observation starts', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      (adapter as any).manager = currentMockManager;

      await adapter.subscribeKeyframes(defaultDeviceInfo, rs.fn());

      expect(currentMockManager.ensureConnected).toHaveBeenCalledTimes(1);
      expect(
        currentMockManager.ensureFrameClockCalibration,
      ).toHaveBeenCalledTimes(1);
      expect(currentMockManager.setFreshnessBarrier).not.toHaveBeenCalled();
      expect(currentMockManager.subscribeKeyframes).toHaveBeenCalledTimes(1);
    });

    it('moves the barrier after an input action completes', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      (adapter as any).manager = currentMockManager;
      currentMockManager.isConnected.mockReturnValue(true);
      rs.spyOn(adapter as any, 'monotonicTimeUs').mockReturnValue(10_100_000n);

      await adapter.markActionBarrier();

      expect(currentMockManager.setFreshnessBarrier).toHaveBeenCalledWith(
        'completed input action',
        {
          hostMonotonicUs: 10_100_000n,
        },
      );
    });

    it('keeps a successful input action successful when clock sampling fails', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      (adapter as any).manager = currentMockManager;
      currentMockManager.isConnected.mockReturnValue(true);
      currentMockManager.setFreshnessBarrier.mockRejectedValue(
        new Error('dumpsys unavailable'),
      );

      await expect(adapter.markActionBarrier()).resolves.toBeUndefined();

      expect(currentMockManager.dispose).toHaveBeenCalledTimes(1);
      expect((adapter as any).manager).toBeNull();
      expect(adapter.getStatus()).toMatchObject({
        lastError: 'dumpsys unavailable',
        retryAfter: expect.any(Number),
      });
    });

    it('defers the latest action barrier until a recovering stream is connected', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      (adapter as any).manager = currentMockManager;
      currentMockManager.isConnected.mockReturnValue(false);
      rs.spyOn(adapter as any, 'monotonicTimeUs')
        .mockReturnValueOnce(10_100_000n)
        .mockReturnValueOnce(10_200_000n);

      await adapter.markActionBarrier();
      await adapter.markActionBarrier();
      expect(currentMockManager.setFreshnessBarrier).not.toHaveBeenCalled();

      await adapter.screenshotBase64(defaultDeviceInfo);
      expect(currentMockManager.setFreshnessBarrier).toHaveBeenCalledWith(
        'completed input action while scrcpy was unavailable',
        {
          hostMonotonicUs: 10_200_000n,
        },
      );
      expect(
        currentMockManager.setFreshnessBarrier.mock.invocationCallOrder[0],
      ).toBeLessThan(
        currentMockManager.getScreenshotJpeg.mock.invocationCallOrder[0],
      );
    });
  });

  describe('initialize', () => {
    it('should call ensureManager and manager.ensureConnected', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });

      await adapter.initialize(defaultDeviceInfo);

      expect(currentMockManager.validateEnvironment).toHaveBeenCalledTimes(1);
      expect(currentMockManager.ensureConnected).toHaveBeenCalledTimes(1);
      expect((adapter as any).manager).toBe(currentMockManager);
    });

    it('deduplicates concurrent manager initialization', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });

      const [first, second] = await Promise.all([
        adapter.ensureManager(defaultDeviceInfo),
        adapter.ensureManager(defaultDeviceInfo),
      ]);

      expect(first).toBe(currentMockManager);
      expect(second).toBe(currentMockManager);
      expect(currentMockManager.validateEnvironment).toHaveBeenCalledTimes(1);
    });

    it('should record ensureManager failures without permanently disabling scrcpy', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      currentMockManager.validateEnvironment.mockRejectedValue(
        new Error('ffmpeg not found'),
      );

      await expect(adapter.initialize(defaultDeviceInfo)).rejects.toThrow();
      expect(adapter.getStatus()).toMatchObject({
        enabled: true,
        connected: false,
        lastError: expect.stringContaining('ffmpeg not found'),
        retryAfter: expect.any(Number),
      });
      expect(currentMockManager.dispose).toHaveBeenCalledTimes(1);
    });

    it('should recover after a transient ensureConnected failure', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      currentMockManager.ensureConnected
        .mockRejectedValueOnce(new Error('scrcpy connection failed'))
        .mockResolvedValueOnce(undefined);

      await expect(adapter.initialize(defaultDeviceInfo)).rejects.toThrow(
        'scrcpy connection failed',
      );
      expect(adapter.isEnabled()).toBe(false);
      expect(adapter.getStatus().enabled).toBe(true);

      await adapter.initialize(defaultDeviceInfo);
      currentMockManager.isConnected.mockReturnValue(true);

      expect(currentMockManager.ensureConnected).toHaveBeenCalledTimes(2);
      expect(adapter.getStatus()).toEqual({
        enabled: true,
        connected: true,
        lastError: null,
        retryAfter: null,
      });
    });
  });

  describe('retry cooldown', () => {
    it('should fall back during cooldown and retry on a later screenshot', async () => {
      rs.useFakeTimers();
      rs.setSystemTime(new Date('2026-07-15T00:00:00Z'));
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      currentMockManager.ensureConnected.mockRejectedValueOnce(
        new Error('codec not ready'),
      );

      await expect(adapter.initialize(defaultDeviceInfo)).rejects.toThrow(
        'codec not ready',
      );
      await expect(adapter.screenshotBase64(defaultDeviceInfo)).rejects.toThrow(
        /retry is cooling down/,
      );
      expect(currentMockManager.getScreenshotJpeg).not.toHaveBeenCalled();

      rs.advanceTimersByTime(60_000);
      await expect(adapter.screenshotBase64(defaultDeviceInfo)).resolves.toBe(
        'data:image/png;base64,test',
      );
      expect(currentMockManager.getScreenshotJpeg).toHaveBeenCalledTimes(1);
      expect(adapter.getStatus().lastError).toBeNull();
    });
  });

  describe('freshness diagnostics', () => {
    it.each([4_000_000, 100_000_000])(
      'does not prescribe bitrate changes for a freshness timeout at %i bps',
      (videoBitRate) => {
        const message = formatScrcpyFreshFrameFailure(
          createFreshnessError('no post-action frame', { videoBitRate }),
        );

        expect(message).toContain(
          'does not by itself identify bandwidth or the configured video bitrate as the cause',
        );
        expect(message.toLowerCase()).not.toContain('lower');
        expect(message).not.toContain('--scrcpy-video-bit-rate');
        expect(message.toLowerCase()).not.toContain('start with');
      },
    );

    it('classifies a missing new-epoch frame as a startup failure', () => {
      const message = formatScrcpyFreshFrameFailure(
        createFreshnessError('no initial data frame', {
          failureKind: 'stream-startup',
          timeoutMs: 5_000,
        }),
      );

      expect(message).toContain('stream startup or encoder-readiness failure');
      expect(message.toLowerCase()).not.toContain('lower');
    });
  });

  describe('freshness recovery', () => {
    it('restarts a stale stream once and returns the new epoch baseline', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      (adapter as any).manager = currentMockManager;
      currentMockManager.getScreenshotJpeg.mockRejectedValueOnce(
        createFreshnessError('stale stream closed'),
      );

      await expect(adapter.screenshotBase64(defaultDeviceInfo)).resolves.toBe(
        'data:image/png;base64,test',
      );
      expect(currentMockManager.getScreenshotJpeg).toHaveBeenCalledTimes(2);
      expect(currentMockManager.validateEnvironment).not.toHaveBeenCalled();
      expect(currentMockManager.dispose).not.toHaveBeenCalled();
      expect(adapter.isEnabled()).toBe(true);
      expect(adapter.getStatus().lastError).toBeNull();
    });

    it('enters cooldown when the restarted stream also fails, then retries with the same manager', async () => {
      rs.useFakeTimers();
      rs.setSystemTime(new Date('2026-08-24T00:00:00Z'));
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      (adapter as any).manager = currentMockManager;
      currentMockManager.getScreenshotJpeg
        .mockRejectedValueOnce(
          createFreshnessError('first stale stream closed'),
        )
        .mockRejectedValueOnce(createFreshnessError('retry stream closed'));

      await expect(adapter.screenshotBase64(defaultDeviceInfo)).rejects.toThrow(
        'retry stream closed',
      );
      expect(adapter.isEnabled()).toBe(false);
      expect((adapter as any).manager).toBe(currentMockManager);
      expect(currentMockManager.dispose).not.toHaveBeenCalled();

      rs.advanceTimersByTime(5_000);
      await expect(adapter.screenshotBase64(defaultDeviceInfo)).resolves.toBe(
        'data:image/png;base64,test',
      );
      expect(adapter.isEnabled()).toBe(true);
      expect(adapter.getStatus().lastError).toBeNull();
      expect(currentMockManager.getScreenshotJpeg).toHaveBeenCalledTimes(3);
    });

    it('shares one in-band restart across concurrent stale screenshots', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      (adapter as any).manager = currentMockManager;
      let resolveRestart: ((value: Buffer) => void) | undefined;
      const restartFrame = new Promise<Buffer>((resolve) => {
        resolveRestart = resolve;
      });
      currentMockManager.getScreenshotJpeg
        .mockRejectedValueOnce(createFreshnessError('first stale call'))
        .mockRejectedValueOnce(createFreshnessError('second stale call'))
        .mockReturnValueOnce(restartFrame);

      const first = adapter.screenshotBase64(defaultDeviceInfo);
      const second = adapter.screenshotBase64(defaultDeviceInfo);
      await rs.waitFor(() => {
        expect(currentMockManager.getScreenshotJpeg).toHaveBeenCalledTimes(3);
      });
      resolveRestart?.(Buffer.from('recovered-frame'));

      await expect(Promise.all([first, second])).resolves.toEqual([
        'data:image/png;base64,test',
        'data:image/png;base64,test',
      ]);
      expect(currentMockManager.getScreenshotJpeg).toHaveBeenCalledTimes(3);
      expect(currentMockManager.ensureConnected).toHaveBeenCalledTimes(3);
    });

    it('recognizes and retries freshness errors across duplicated module instances', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      (adapter as any).manager = currentMockManager;
      const crossModuleError = Object.assign(new Error('stale stream closed'), {
        code: SCRCPY_FRESH_FRAME_UNAVAILABLE_ERROR_CODE,
      });
      currentMockManager.getScreenshotJpeg.mockRejectedValueOnce(
        crossModuleError,
      );

      await expect(adapter.screenshotBase64(defaultDeviceInfo)).resolves.toBe(
        'data:image/png;base64,test',
      );
      expect(currentMockManager.getScreenshotJpeg).toHaveBeenCalledTimes(2);
      expect(adapter.isEnabled()).toBe(true);
      expect(adapter.getStatus().retryAfter).toBeNull();
    });

    it('reattaches active frame listeners after in-band stream recovery', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      (adapter as any).manager = currentMockManager;
      currentMockManager.isConnected
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      const listener = rs.fn();
      const unsubscribe = await adapter.subscribeKeyframes(
        defaultDeviceInfo,
        listener,
      );
      currentMockManager.getScreenshotJpeg.mockRejectedValueOnce(
        createFreshnessError('stale stream closed'),
      );

      await expect(adapter.screenshotBase64(defaultDeviceInfo)).resolves.toBe(
        'data:image/png;base64,test',
      );
      expect(currentMockManager.subscribeKeyframes).toHaveBeenCalledTimes(2);
      unsubscribe();
      expect(currentMockManager.subscribeKeyframes).toHaveBeenCalledWith(
        listener,
      );
    });

    it('reattaches active frame listeners after a double freshness failure and cooldown reconnect', async () => {
      rs.useFakeTimers();
      rs.setSystemTime(new Date('2026-08-25T00:00:00Z'));
      const adapter = new ScrcpyDeviceAdapter('device', { enabled: true });
      (adapter as any).manager = currentMockManager;
      currentMockManager.isConnected
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false);
      currentMockManager.getScreenshotJpeg
        .mockRejectedValueOnce(createFreshnessError('stale stream closed'))
        .mockRejectedValueOnce(createFreshnessError('retry stream closed'));
      const listener = rs.fn();
      const unsubscribe = await adapter.subscribeKeyframes(
        defaultDeviceInfo,
        listener,
      );

      await expect(adapter.screenshotBase64(defaultDeviceInfo)).rejects.toThrow(
        'retry stream closed',
      );
      expect(currentMockManager.subscribeKeyframes).toHaveBeenCalledTimes(2);

      rs.advanceTimersByTime(5_000);
      await expect(adapter.screenshotBase64(defaultDeviceInfo)).resolves.toBe(
        'data:image/png;base64,test',
      );
      expect(currentMockManager.subscribeKeyframes).toHaveBeenCalledTimes(3);
      expect(currentMockManager.subscribeKeyframes).toHaveBeenLastCalledWith(
        listener,
      );
      unsubscribe();
    });
  });

  describe('disconnect', () => {
    it('should clear manager and resolvedConfig', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      (adapter as any).manager = currentMockManager;
      adapter.resolveConfig(); // populate cache

      await adapter.disconnect();

      expect((adapter as any).manager).toBeNull();
      expect((adapter as any).resolvedConfig).toBeNull();
      expect(currentMockManager.dispose).toHaveBeenCalledTimes(1);
      expect(adapter.getStatus().lastError).toBeNull();
      expect(adapter.getStatus().retryAfter).toBeNull();
    });

    it('should handle disconnect errors gracefully (no throw)', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      (adapter as any).manager = currentMockManager;
      currentMockManager.dispose.mockRejectedValue(
        new Error('disconnect failed'),
      );

      await expect(adapter.disconnect()).resolves.toBeUndefined();
      expect((adapter as any).manager).toBeNull();
    });

    it('should be no-op when no manager exists', async () => {
      const adapter = new ScrcpyDeviceAdapter('device', undefined);
      await expect(adapter.disconnect()).resolves.toBeUndefined();
    });
  });
});
