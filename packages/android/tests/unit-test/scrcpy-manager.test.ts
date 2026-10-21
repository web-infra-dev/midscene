import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  ScrcpyFreshFrameUnavailableError,
  ScrcpyScreenshotManager,
  type ScrcpyScreenshotOptions,
  type ScrcpyServerPusher,
  parseDeviceUptimeMs,
} from '../../src/scrcpy-manager';

const noopPushServer: ScrcpyServerPusher = async () => {};
const createManager = (
  adb: ConstructorParameters<typeof ScrcpyScreenshotManager>[0],
  options: ScrcpyScreenshotOptions = {},
  pushServer: ScrcpyServerPusher = noopPushServer,
) => new ScrcpyScreenshotManager(adb, pushServer, options);

// A minimal H.264 keyframe: 4-byte start code + IDR NAL (type 5).
const idrFrame = (tag: number): Buffer =>
  Buffer.from([0x00, 0x00, 0x00, 0x01, 0x65, tag]);
const spsPacket = () => ({
  type: 'configuration',
  data: Buffer.from([0x00, 0x00, 0x00, 0x01, 0x67, 0xaa]),
});
const dataPacket = (tag: number, pts: bigint) => ({
  type: 'data',
  data: idrFrame(tag),
  pts,
});
const jpegFrame = (width = 1, height = 1): Buffer =>
  Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);

const prepareCachedPlanningFrame = (
  manager: ScrcpyScreenshotManager,
  options: {
    ptsUs?: bigint;
    frameData?: string;
    roundTripUs?: bigint;
    resetVideo?: () => Promise<void>;
  } = {},
) => {
  const internals = manager as any;
  if (options.resetVideo) {
    internals.scrcpyClient = {
      controller: { resetVideo: options.resetVideo },
    };
  }
  internals.spsHeader = Buffer.from('header');
  internals.lastRawKeyframe = Buffer.from(options.frameData ?? 'fresh-frame');
  internals.lastRawKeyframePtsUs = options.ptsUs ?? 2_000_000n;
  internals.lastRawKeyframeAt = 2_000;
  internals.lastRawKeyframeStreamEpoch = internals.streamEpoch;
  internals.deviceClockCalibration = {
    deviceUptimeUs: 2_000_000n,
    hostMonotonicUs: 10_000_000n,
    hostWallTimeMs: 2_000,
    roundTripUs: options.roundTripUs ?? 1_544_554n,
  };
  rs.spyOn(internals, 'monotonicTimeUs').mockReturnValue(10_000_000n);
  rs.spyOn(manager, 'ensureConnected').mockResolvedValue();
  rs.spyOn(internals, 'resetIdleTimer').mockImplementation(() => {});
};

describe('ScrcpyScreenshotManager', () => {
  afterEach(() => {
    rs.useRealTimers();
    rs.restoreAllMocks();
  });

  describe('validateEnvironment', () => {
    it('should succeed when ffmpeg is available', async () => {
      const manager = createManager({} as any);
      rs.spyOn(manager as any, 'checkFfmpegAvailable').mockResolvedValue(true);

      await expect(manager.validateEnvironment()).resolves.toBeUndefined();
    });

    it('should throw when ffmpeg is not available', async () => {
      const manager = createManager({} as any);
      rs.spyOn(manager as any, 'checkFfmpegAvailable').mockResolvedValue(false);

      await expect(manager.validateEnvironment()).rejects.toThrow(
        'ffmpeg is not available',
      );
    });

    it('should throw when checkFfmpegAvailable throws an error', async () => {
      const manager = createManager({} as any);
      rs.spyOn(manager as any, 'checkFfmpegAvailable').mockRejectedValue(
        new Error('unexpected error'),
      );

      await expect(manager.validateEnvironment()).rejects.toThrow(
        'ffmpeg is not available',
      );
    });

    it('should cache ffmpeg check result (only check once on success)', async () => {
      const manager = createManager({} as any);
      const spy = rs
        .spyOn(manager as any, 'checkFfmpegAvailable')
        .mockResolvedValue(true);

      await manager.validateEnvironment();
      await manager.validateEnvironment();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should be independent from ensureConnected', async () => {
      const manager = createManager({} as any);
      rs.spyOn(manager as any, 'checkFfmpegAvailable').mockResolvedValue(true);

      // validateEnvironment should not trigger ensureConnected logic
      const ensureConnectedSpy = rs.spyOn(manager, 'ensureConnected');

      await manager.validateEnvironment();

      expect(ensureConnectedSpy).not.toHaveBeenCalled();
    });
  });

  describe('constructor defaults', () => {
    it('should use default options when none provided', () => {
      const manager = createManager({} as any);
      const options = (manager as any).options;
      expect(options.maxSize).toBe(0);
      expect(options.videoBitRate).toBe(100_000_000);
      expect(options.idleTimeoutMs).toBe(30_000);
    });

    it('should use provided options', () => {
      const manager = createManager({} as any, {
        maxSize: 1024,
        videoBitRate: 4_000_000,
        idleTimeoutMs: 60_000,
      });
      const options = (manager as any).options;
      expect(options.maxSize).toBe(1024);
      expect(options.videoBitRate).toBe(4_000_000);
      expect(options.idleTimeoutMs).toBe(60_000);
    });

    it('should partially override defaults', () => {
      const manager = createManager({} as any, {
        maxSize: 512,
      });
      const options = (manager as any).options;
      expect(options.maxSize).toBe(512);
      expect(options.videoBitRate).toBe(100_000_000); // default
      expect(options.idleTimeoutMs).toBe(30_000); // default
    });

    it('should clamp videoBitRate to safe maximum', () => {
      const manager = createManager({} as any, {
        videoBitRate: 500_000_000,
      });
      const options = (manager as any).options;
      expect(options.videoBitRate).toBe(100_000_000);
    });
  });

  describe('getResolution', () => {
    it('should return null when not connected', () => {
      const manager = createManager({} as any);
      expect(manager.getResolution()).toBeNull();
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      const manager = createManager({} as any);
      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('ensureConnected', () => {
    it('should use a forward tunnel with a fresh scrcpy instance id', async () => {
      const manager = createManager({} as any, {
        maxSize: 1024,
        videoBitRate: 8_000_000,
      });

      const firstOptions = await (manager as any).createScrcpyOptions();
      const secondOptions = await (manager as any).createScrcpyOptions();

      expect(firstOptions.value).toMatchObject({
        control: true,
        powerOn: false,
        clipboardAutosync: false,
        tunnelForward: true,
        maxSize: 1024,
        videoBitRate: 8_000_000,
      });
      expect(firstOptions.value.scid).toBeDefined();
      expect(secondOptions.value.scid).toBeDefined();
      expect(firstOptions.value.scid).not.toBe(secondOptions.value.scid);
    });

    it('disables repeated frames so unchanged pixels cannot acquire a fresh PTS', async () => {
      const manager = createManager({} as any);

      const options = await (manager as any).createScrcpyOptions();

      expect(options.value.videoCodecOptions).toContain(
        'repeat-previous-frame-after=0',
      );
    });

    it('uses the configured server pusher during connection', async () => {
      const { AdbScrcpyClient } = await import('@yume-chan/adb-scrcpy');
      const pushServer = rs.fn().mockResolvedValue(undefined);
      const manager = createManager(
        { close: rs.fn().mockResolvedValue(undefined) } as any,
        {},
        pushServer,
      );
      const videoStream = new ReadableStream();
      rs.spyOn(manager as any, 'resolveServerBinPath').mockReturnValue(
        '/tmp/scrcpy-server',
      );
      rs.spyOn(manager as any, 'ensureFrameClockCalibration').mockResolvedValue(
        undefined,
      );
      rs.spyOn(AdbScrcpyClient, 'start').mockResolvedValue({
        close: rs.fn().mockResolvedValue(undefined),
        output: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        videoStream: Promise.resolve({
          metadata: { width: 1080, height: 1920 },
          stream: videoStream,
        }),
      } as any);

      await manager.ensureConnected();

      expect(pushServer).toHaveBeenCalledWith(
        '/tmp/scrcpy-server',
        '/data/local/tmp/scrcpy-server.jar',
      );
      await manager.dispose();
    });

    it('shares one connection attempt across concurrent callers', async () => {
      const manager = createManager({} as any);
      let resolveConnection: (() => void) | undefined;
      const connection = new Promise<void>((resolve) => {
        resolveConnection = resolve;
      });
      const connectScrcpy = rs
        .spyOn(manager as any, 'connectScrcpy')
        .mockReturnValue(connection);

      const first = manager.ensureConnected();
      const second = manager.ensureConnected();
      expect(connectScrcpy).toHaveBeenCalledTimes(1);
      resolveConnection?.();

      await expect(Promise.all([first, second])).resolves.toEqual([
        undefined,
        undefined,
      ]);
    });

    it('should calibrate an already-started stream only once', async () => {
      const manager = createManager({} as any);
      (manager as any).scrcpyClient = {};
      (manager as any).videoStream = {};
      const readClock = rs
        .spyOn(manager as any, 'readDeviceClockCalibration')
        .mockResolvedValue({
          deviceUptimeUs: 1_000_000n,
          hostMonotonicUs: 10_000_000n,
          hostWallTimeMs: 2_000,
          roundTripUs: 10_000n,
        });

      await expect(manager.ensureConnected()).resolves.toBeUndefined();
      await expect(manager.ensureConnected()).resolves.toBeUndefined();

      expect(readClock).toHaveBeenCalledTimes(1);
    });

    it('shares a connection failure across concurrent callers', async () => {
      const manager = createManager({} as any);
      const connectionError = new Error('codec unavailable');
      rs.spyOn(manager as any, 'connectScrcpy').mockRejectedValue(
        connectionError,
      );

      const first = manager.ensureConnected();
      const second = manager.ensureConnected();
      await expect(first).rejects.toBe(connectionError);
      await expect(second).rejects.toBe(connectionError);
    });

    it('should include client and server output in connection errors', () => {
      const manager = createManager({} as any);
      const error = Object.assign(new Error('ExactReadable ended'), {
        output: ['server exited before metadata'],
      });

      const result = (manager as any).createConnectionError(error, [
        'java.lang.IllegalStateException: codec not ready',
      ]);

      expect(result.message).toContain('ExactReadable ended');
      expect(result.message).toContain('server exited before metadata');
      expect(result.message).toContain(
        'java.lang.IllegalStateException: codec not ready',
      );
    });

    it('should bound collected server output to the latest lines', async () => {
      const manager = createManager({} as any);
      const lines: string[] = [];
      const output = new ReadableStream<string>({
        start(controller) {
          for (let index = 0; index < 110; index++) {
            controller.enqueue(`line-${index}`);
          }
          controller.close();
        },
      });

      await (manager as any).collectServerOutput(output, lines);

      expect(lines).toHaveLength(100);
      expect(lines[0]).toBe('line-10');
      expect(lines.at(-1)).toBe('line-109');
    });
  });

  describe('consumeFramesLoop', () => {
    it('should absorb a rejected cancellation after a stream read error', async () => {
      const manager = createManager({} as any);
      const streamError = new Error(
        'The underlying readable ended before the struct was deserialized',
      );
      const reader = {
        read: rs.fn().mockRejectedValue(streamError),
        cancel: rs.fn().mockRejectedValue(streamError),
      };
      const close = rs.fn().mockResolvedValue(undefined);
      (manager as any).streamReader = reader;
      (manager as any).scrcpyClient = { close };
      (manager as any).videoStream = {};
      (manager as any).isInitialized = true;

      await expect(
        (manager as any).consumeFramesLoop(reader),
      ).resolves.toBeUndefined();

      expect(reader.cancel).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(manager.isConnected()).toBe(false);
    });

    it('should disconnect the current session after a clean stream end', async () => {
      const manager = createManager({} as any);
      const reader = {
        read: rs.fn().mockResolvedValue({ done: true }),
        cancel: rs.fn().mockResolvedValue(undefined),
      };
      const close = rs.fn().mockResolvedValue(undefined);
      (manager as any).streamReader = reader;
      (manager as any).scrcpyClient = { close };
      (manager as any).videoStream = {};
      (manager as any).isInitialized = true;

      await (manager as any).consumeFramesLoop(reader);

      expect(reader.cancel).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(manager.isConnected()).toBe(false);
    });

    it('should not disconnect a replacement session when an obsolete reader ends', async () => {
      const manager = createManager({} as any);
      const obsoleteReader = {
        read: rs.fn().mockResolvedValue({ done: true }),
        cancel: rs.fn().mockResolvedValue(undefined),
      };
      const replacementReader = {
        cancel: rs.fn().mockResolvedValue(undefined),
      };
      const close = rs.fn().mockResolvedValue(undefined);
      (manager as any).streamReader = replacementReader;
      (manager as any).scrcpyClient = { close };
      (manager as any).videoStream = {};
      (manager as any).isInitialized = true;

      await (manager as any).consumeFramesLoop(obsoleteReader);

      expect(obsoleteReader.cancel).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
      expect(manager.isConnected()).toBe(true);
    });
  });

  describe('device-clock frame freshness', () => {
    it('parses Android uptime from every TimeUtils format', () => {
      expect(
        parseDeviceUptimeMs('  mLastWakeTime=324781136 (228676 ms ago)\n'),
      ).toBe(325009812n);
      expect(parseDeviceUptimeMs('mLastWakeTime=1000 (in 200 ms)')).toBe(800n);
      expect(parseDeviceUptimeMs('mLastWakeTime=1000 (now)')).toBe(1000n);
      expect(() => parseDeviceUptimeMs('no uptime here')).toThrow(
        /Unable to read Android device uptime/,
      );
    });

    it('samples the device uptime and brackets it with host clocks', async () => {
      const spawnWaitText = rs.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'mLastWakeTime=1000 (50 ms ago)',
        stderr: '',
      });
      const manager = createManager({
        subprocess: {
          shellProtocol: { spawnWaitText },
        },
      } as any);
      rs.spyOn(manager as any, 'monotonicTimeUs')
        .mockReturnValueOnce(10_000_000n)
        .mockReturnValueOnce(10_020_000n);
      rs.spyOn(Date, 'now')
        .mockReturnValueOnce(2_000)
        .mockReturnValueOnce(2_020);

      const calibration = await (manager as any).readDeviceClockCalibration();

      expect(spawnWaitText).toHaveBeenCalledWith(['dumpsys', 'power']);
      expect(calibration).toEqual({
        deviceUptimeUs: 1_050_000n,
        hostMonotonicUs: 10_010_000n,
        hostWallTimeMs: 2_010,
        roundTripUs: 20_000n,
      });
    });

    it('drops frames captured before the device-clock barrier', async () => {
      const manager = createManager({} as any);
      const listener = rs.fn();
      const warn = rs.spyOn(console, 'warn').mockImplementation(() => {});
      manager.subscribeKeyframes(listener);
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 1_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);

      const barrier = await manager.setFreshnessBarrier(
        'completed input action',
      );
      expect(barrier).toBe(1_006_000n);

      (manager as any).processFrame(spsPacket());
      (manager as any).processFrame(dataPacket(0x01, 1_005_999n));
      expect(manager.getLatestRawKeyframe()).toBeNull();
      expect(listener).not.toHaveBeenCalled();
      expect((manager as any).frameFreshnessError?.message).toContain(
        'completed input action',
      );
      expect(warn).not.toHaveBeenCalledWith(
        '[Midscene]',
        expect.stringContaining('predates the completed input action'),
      );

      (manager as any).processFrame(dataPacket(0x02, 1_006_000n));
      expect(manager.getLatestRawKeyframe()?.data[5]).toBe(0x02);
      expect(listener).toHaveBeenCalledTimes(1);
      expect((manager as any).frameFreshnessError).toBeNull();
    });

    it('ignores packets delivered by an obsolete stream reader', () => {
      const manager = createManager({} as any);
      (manager as any).streamReaderEpoch = 2;

      (manager as any).processFrame(spsPacket(), 1);
      (manager as any).processFrame(dataPacket(0x01, 1_000_000n), 1);

      expect((manager as any).spsHeader).toBeNull();
      expect((manager as any).lastRawKeyframe).toBeNull();
    });

    it('projects every barrier from one stream-epoch clock sample', async () => {
      const manager = createManager({} as any);
      const readClock = rs
        .spyOn(manager as any, 'readDeviceClockCalibration')
        .mockResolvedValue({
          deviceUptimeUs: 1_000_000n,
          hostMonotonicUs: 10_000_000n,
          hostWallTimeMs: 2_000,
          roundTripUs: 10_000n,
        });
      await manager.ensureFrameClockCalibration();
      rs.spyOn(manager as any, 'monotonicTimeUs')
        .mockReturnValueOnce(10_100_000n)
        .mockReturnValueOnce(10_250_000n);

      await expect(
        manager.setFreshnessBarrier('completed input action'),
      ).resolves.toBe(1_106_000n);
      await expect(
        manager.setFreshnessBarrier('stale planning frame'),
      ).resolves.toBe(1_256_000n);

      expect(readClock).toHaveBeenCalledTimes(1);
    });

    it('projects a deferred action barrier from when the action completed', async () => {
      const manager = createManager({} as any);
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 1_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_500_000n);

      const barrier = await manager.setFreshnessBarrier(
        'completed input action while scrcpy was unavailable',
        { hostMonotonicUs: 10_100_000n },
      );

      expect(barrier).toBe(1_106_000n);

      (manager as any).processFrame(spsPacket());
      (manager as any).processFrame(dataPacket(0x01, 1_200_000n));
      expect(manager.getLatestRawKeyframe()?.data[5]).toBe(0x01);
    });

    it('preserves a cached frame that already crosses a completed-action barrier', async () => {
      const manager = createManager({} as any);
      (manager as any).spsHeader = Buffer.from('header');
      (manager as any).lastRawKeyframe = Buffer.from('post-action-frame');
      (manager as any).lastRawKeyframePtsUs = 1_200_000n;
      (manager as any).lastRawKeyframeAt = 2_000;
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 1_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };

      await manager.setFreshnessBarrier('completed input action', {
        hostMonotonicUs: 10_100_000n,
      });

      expect((manager as any).lastRawKeyframe).toEqual(
        Buffer.from('post-action-frame'),
      );
      expect((manager as any).lastRawKeyframePtsUs).toBe(1_200_000n);
    });

    it('rejects a delayed first frame even while the new-stream startup window is active', async () => {
      const resetVideo = rs.fn().mockResolvedValue(undefined);
      const manager = createManager({} as any);
      (manager as any).scrcpyClient = { controller: { resetVideo } };
      (manager as any).spsHeader = Buffer.from('header');
      (manager as any).lastRawKeyframe = Buffer.from('delayed-in-transport');
      (manager as any).lastRawKeyframePtsUs = 1_000_000n;
      (manager as any).streamStartupWindow = {
        deadlineAt: Date.now() + 5_000,
      };
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 5_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);
      rs.spyOn(manager, 'ensureConnected').mockResolvedValue();
      rs.spyOn(manager as any, 'resetIdleTimer').mockImplementation(() => {});
      const waitForNextKeyframe = rs
        .spyOn(manager as any, 'waitForNextKeyframe')
        .mockRejectedValue(new Error('no fresh frame after delayed baseline'));
      const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();
      const setBarrier = rs.spyOn(manager, 'setFreshnessBarrier');
      const decode = rs.spyOn(manager as any, 'decodeH264ToJpeg');

      await expect(manager.getScreenshotJpeg()).rejects.toMatchObject({
        name: 'ScrcpyFreshFrameUnavailableError',
        failureKind: 'freshness-target',
        timeoutMs: 300,
      });
      expect(waitForNextKeyframe).toHaveBeenCalledOnce();
      expect(setBarrier).toHaveBeenCalledWith('stale planning frame');
      expect(resetVideo).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledOnce();
      expect(decode).not.toHaveBeenCalled();
    });

    it('uses the startup timeout while waiting for the first data frame of a new stream', async () => {
      const manager = createManager({} as any);
      (manager as any).spsHeader = Buffer.from('header');
      (manager as any).streamStartupWindow = {
        deadlineAt: Date.now() + 5_000,
      };
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 2_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);
      rs.spyOn(manager, 'ensureConnected').mockResolvedValue();
      rs.spyOn(manager as any, 'resetIdleTimer').mockImplementation(() => {});
      const waitForNextKeyframe = rs
        .spyOn(manager as any, 'waitForNextKeyframe')
        .mockResolvedValue({
          data: Buffer.from('initial-frame'),
          header: Buffer.from('header'),
          ptsUs: 2_000_000n,
          estimatedAgeMs: 0,
          streamEpoch: (manager as any).streamEpoch,
          capturedAt: 2_000,
        });
      rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(
        jpegFrame(),
      );

      await expect(manager.getScreenshotJpeg()).resolves.toEqual(jpegFrame());
      const startupWaitMs = waitForNextKeyframe.mock.calls[0][0];
      expect(startupWaitMs).toBeGreaterThan(4_000);
      expect(startupWaitMs).toBeLessThanOrEqual(5_000);
      expect((manager as any).streamStartupWindow).toBeNull();
    });

    it('deduplicates concurrent clock calibration for one stream epoch', async () => {
      const manager = createManager({} as any);
      let resolveClock:
        | ((value: {
            deviceUptimeUs: bigint;
            hostMonotonicUs: bigint;
            hostWallTimeMs: number;
            roundTripUs: bigint;
          }) => void)
        | undefined;
      const readClock = rs
        .spyOn(manager as any, 'readDeviceClockCalibration')
        .mockReturnValue(
          new Promise((resolve) => {
            resolveClock = resolve;
          }),
        );

      const first = manager.ensureFrameClockCalibration();
      const second = manager.ensureFrameClockCalibration();
      resolveClock?.({
        deviceUptimeUs: 1_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      });

      await expect(Promise.all([first, second])).resolves.toEqual([
        undefined,
        undefined,
      ]);
      expect(readClock).toHaveBeenCalledTimes(1);
    });

    it('discards an in-flight clock sample from a disconnected epoch', async () => {
      const manager = createManager({} as any);
      let resolveClock:
        | ((value: {
            deviceUptimeUs: bigint;
            hostMonotonicUs: bigint;
            hostWallTimeMs: number;
            roundTripUs: bigint;
          }) => void)
        | undefined;
      rs.spyOn(manager as any, 'readDeviceClockCalibration').mockReturnValue(
        new Promise((resolve) => {
          resolveClock = resolve;
        }),
      );

      const calibration = manager.ensureFrameClockCalibration();
      await manager.disconnect();
      resolveClock?.({
        deviceUptimeUs: 1_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      });

      await expect(calibration).rejects.toThrow(/stream epoch changed/);
      expect((manager as any).deviceClockCalibration).toBeNull();
    });

    it('requires a stream-epoch clock anchor before arming a barrier', async () => {
      const manager = createManager({} as any);
      const readClock = rs.spyOn(manager as any, 'readDeviceClockCalibration');

      await expect(
        manager.setFreshnessBarrier('completed input action'),
      ).rejects.toThrow(/not calibrated for the current stream epoch/);

      expect(readClock).not.toHaveBeenCalled();
    });

    it('takes a new clock sample after the stream epoch is reset', async () => {
      const manager = createManager({} as any);
      const readClock = rs
        .spyOn(manager as any, 'readDeviceClockCalibration')
        .mockResolvedValueOnce({
          deviceUptimeUs: 1_000_000n,
          hostMonotonicUs: 10_000_000n,
          hostWallTimeMs: 2_000,
          roundTripUs: 10_000n,
        })
        .mockResolvedValueOnce({
          deviceUptimeUs: 2_000_000n,
          hostMonotonicUs: 20_000_000n,
          hostWallTimeMs: 3_000,
          roundTripUs: 12_000n,
        });

      await manager.ensureFrameClockCalibration();
      await manager.disconnect();
      await manager.ensureFrameClockCalibration();

      expect(readClock).toHaveBeenCalledTimes(2);
      expect((manager as any).deviceClockCalibration.deviceUptimeUs).toBe(
        2_000_000n,
      );
    });

    it('derives host capture time and absolute age from calibrated PTS', () => {
      const manager = createManager({} as any);
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 1_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_100_000n);

      (manager as any).processFrame(spsPacket());
      (manager as any).processFrame(dataPacket(0x01, 1_050_000n));

      expect(manager.getLatestRawKeyframe()).toMatchObject({
        capturedAt: 2050,
        estimatedAgeMs: 50,
        ptsUs: 1_050_000n,
      });
    });

    it('does not use Android or host wall-clock time for frame age', () => {
      const manager = createManager({} as any);
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 1_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_100_000n);
      rs.spyOn(Date, 'now').mockReturnValue(9_999_999_999_999);

      expect((manager as any).estimateFrameAgeUs(1_050_000n)).toBe(50_000n);
    });

    it('includes half the clock-calibration RTT in the frame-age upper bound', () => {
      const manager = createManager({} as any);
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 1_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 5_000_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);

      expect((manager as any).estimateFrameAge(1_000_000n)).toEqual({
        estimatedAgeUs: 0n,
        calibrationUncertaintyUs: 2_500_000n,
        upperBoundUs: 2_500_000n,
      });
      expect((manager as any).isFrameAgeAcceptable(1_000_000n)).toBe(false);
    });

    it('accepts a frame only when estimated age plus uncertainty is within 500ms', () => {
      const manager = createManager({} as any);
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 1_490_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 20_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);

      expect((manager as any).isFrameAgeAcceptable(1_000_000n)).toBe(true);

      (manager as any).deviceClockCalibration.roundTripUs = 22_000n;
      expect((manager as any).isFrameAgeAcceptable(1_000_000n)).toBe(false);
    });

    it('recalibrates instead of resetting when only clock uncertainty makes a planning frame look stale', async () => {
      const resetVideo = rs.fn().mockResolvedValue(undefined);
      const manager = createManager({} as any);
      prepareCachedPlanningFrame(manager, { resetVideo });
      const readClock = rs
        .spyOn(manager as any, 'readDeviceClockCalibration')
        .mockResolvedValue({
          deviceUptimeUs: 2_000_000n,
          hostMonotonicUs: 10_000_000n,
          hostWallTimeMs: 2_000,
          roundTripUs: 20_000n,
        });
      const barrier = rs.spyOn(manager, 'setFreshnessBarrier');
      const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();
      rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(
        jpegFrame(),
      );

      await expect(manager.getScreenshotJpeg()).resolves.toEqual(jpegFrame());

      expect(readClock).toHaveBeenCalledTimes(1);
      expect((manager as any).deviceClockCalibration.roundTripUs).toBe(20_000n);
      expect(barrier).not.toHaveBeenCalled();
      expect(resetVideo).not.toHaveBeenCalled();
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('retries a persistently uncertain clock only once per calibration lifetime', async () => {
      const resetVideo = rs.fn().mockResolvedValue(undefined);
      const manager = createManager({} as any);
      prepareCachedPlanningFrame(manager, { resetVideo });
      const readClock = rs
        .spyOn(manager as any, 'readDeviceClockCalibration')
        .mockResolvedValue({
          deviceUptimeUs: 2_000_000n,
          hostMonotonicUs: 10_000_000n,
          hostWallTimeMs: 2_000,
          roundTripUs: 1_600_000n,
        });
      const barrier = rs.spyOn(manager, 'setFreshnessBarrier');
      const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();
      rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(
        jpegFrame(),
      );

      await expect(manager.getScreenshotJpeg()).resolves.toEqual(jpegFrame());
      await expect(manager.getScreenshotJpeg()).resolves.toEqual(jpegFrame());

      expect(readClock).toHaveBeenCalledTimes(1);
      expect((manager as any).deviceClockCalibration.roundTripUs).toBe(
        1_544_554n,
      );
      expect(barrier).not.toHaveBeenCalled();
      expect(resetVideo).not.toHaveBeenCalled();
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('uses estimated age when the best-effort recalibration fails without changing epochs', async () => {
      const resetVideo = rs.fn().mockResolvedValue(undefined);
      const manager = createManager({} as any);
      prepareCachedPlanningFrame(manager, { resetVideo });
      const readClock = rs
        .spyOn(manager as any, 'readDeviceClockCalibration')
        .mockRejectedValue(new Error('ADB clock sample failed'));
      const barrier = rs.spyOn(manager, 'setFreshnessBarrier');
      const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();
      rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(
        jpegFrame(),
      );

      await expect(manager.getScreenshotJpeg()).resolves.toEqual(jpegFrame());

      expect(readClock).toHaveBeenCalledOnce();
      expect(barrier).not.toHaveBeenCalled();
      expect(resetVideo).not.toHaveBeenCalled();
      expect(disconnect).not.toHaveBeenCalled();
    });

    it('still rejects a genuinely stale planning frame when clock uncertainty is high', async () => {
      const manager = createManager({} as any);
      prepareCachedPlanningFrame(manager, {
        ptsUs: 1_400_000n,
        frameData: 'stale-frame',
      });
      const readClock = rs.spyOn(manager as any, 'readDeviceClockCalibration');
      const barrier = rs.spyOn(manager, 'setFreshnessBarrier');
      rs.spyOn(manager as any, 'waitForNextKeyframe').mockRejectedValue(
        new Error('no fresh frame'),
      );
      const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();

      await expect(manager.getScreenshotJpeg()).rejects.toMatchObject({
        name: 'ScrcpyFreshFrameUnavailableError',
        failureKind: 'freshness-target',
      });

      expect(readClock).not.toHaveBeenCalled();
      expect(barrier).toHaveBeenCalledWith('stale planning frame');
      expect(disconnect).toHaveBeenCalledOnce();
    });

    it('rejects an uncertainty-only candidate when its stream epoch changes during recalibration', async () => {
      const manager = createManager({} as any);
      prepareCachedPlanningFrame(manager, { frameData: 'obsolete-frame' });
      rs.spyOn(manager as any, 'readDeviceClockCalibration').mockImplementation(
        async () => {
          (manager as any).advanceStreamEpoch();
          (manager as any).deviceClockCalibration = null;
          throw new Error('calibration invalidated');
        },
      );
      const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();
      const decode = rs.spyOn(manager as any, 'decodeH264ToJpeg');

      await expect(manager.getScreenshotJpeg()).rejects.toMatchObject({
        name: 'ScrcpyFreshFrameUnavailableError',
        message: expect.stringContaining(
          'stream epoch changed while recalibrating',
        ),
      });

      expect(decode).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledOnce();
    });

    it('recalibrates the clock anchor when frame PTS moves backwards', async () => {
      const manager = createManager({} as any);
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 1_100_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);

      (manager as any).processFrame(spsPacket());
      (manager as any).processFrame(dataPacket(0x01, 1_050_000n));
      expect(manager.getLatestRawKeyframe()?.data[5]).toBe(0x01);

      (manager as any).processFrame(dataPacket(0x02, 1_040_000n));
      expect(manager.getLatestRawKeyframe()).toBeNull();
      expect((manager as any).frameFreshnessBarrierPending).toBe(true);
      expect((manager as any).frameFreshnessBarrierPtsUs).toBeNull();
      expect((manager as any).deviceClockCalibration).toBeNull();
      expect((manager as any).frameFreshnessError?.message).toContain(
        'PTS moved backwards',
      );

      (manager as any).processFrame(dataPacket(0x03, 1_200_000n));
      expect(manager.getLatestRawKeyframe()).toBeNull();

      const readClock = rs
        .spyOn(manager as any, 'readDeviceClockCalibration')
        .mockResolvedValue({
          deviceUptimeUs: 200_000n,
          hostMonotonicUs: 10_000_000n,
          hostWallTimeMs: 2_100,
          roundTripUs: 10_000n,
        });
      await manager.ensureFrameClockCalibration();
      (manager as any).processFrame(dataPacket(0x04, 200_000n));

      expect(readClock).toHaveBeenCalledTimes(1);
      expect((manager as any).frameFreshnessBarrierPending).toBe(false);
      expect(manager.getLatestRawKeyframe()?.data[5]).toBe(0x04);
    });

    it('hides over-age frames from continuous frame consumers', () => {
      const manager = createManager({} as any);
      const listener = rs.fn();
      manager.subscribeKeyframes(listener);
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 2_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);

      (manager as any).processFrame(spsPacket());
      (manager as any).processFrame(dataPacket(0x01, 1_000_000n));
      expect(manager.getLatestRawKeyframe()).toBeNull();
      expect(listener).not.toHaveBeenCalled();

      (manager as any).processFrame(dataPacket(0x02, 1_800_000n));
      expect(manager.getLatestRawKeyframe()?.data[5]).toBe(0x02);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('reuses a cached frame that crossed the active action barrier', async () => {
      const manager = createManager({} as any);
      (manager as any).spsHeader = Buffer.from('header');
      (manager as any).lastRawKeyframe = Buffer.from('post-action');
      (manager as any).lastRawKeyframePtsUs = 1_050_000n;
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 1_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_100_000n);

      rs.spyOn(manager, 'ensureConnected').mockResolvedValue();
      rs.spyOn(manager as any, 'resetIdleTimer').mockImplementation(() => {});
      const waitForNext = rs.spyOn(manager as any, 'waitForNextKeyframe');
      const setBarrier = rs.spyOn(manager, 'setFreshnessBarrier');
      const decode = rs
        .spyOn(manager as any, 'decodeH264ToJpeg')
        .mockResolvedValue(jpegFrame());

      await expect(manager.getScreenshotJpeg()).resolves.toEqual(jpegFrame());
      expect(setBarrier).not.toHaveBeenCalled();
      expect(waitForNext).not.toHaveBeenCalled();
      expect(decode).toHaveBeenCalledWith(
        Buffer.concat([Buffer.from('header'), Buffer.from('post-action')]),
      );
    });

    it('adds a planning barrier for a post-action frame that is already over-age', async () => {
      const manager = createManager({} as any);
      (manager as any).spsHeader = Buffer.from('header');
      (manager as any).lastRawKeyframe = Buffer.from('post-action-backlog');
      (manager as any).lastRawKeyframePtsUs = 1_100_000n;
      (manager as any).frameFreshnessBarrierPtsUs = 1_000_000n;
      (manager as any).streamStartupWindow = {
        deadlineAt: Date.now() + 5_000,
      };
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 2_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);
      rs.spyOn(manager, 'ensureConnected').mockResolvedValue();
      rs.spyOn(manager as any, 'resetIdleTimer').mockImplementation(() => {});
      rs.spyOn(manager as any, 'waitForNextKeyframe').mockResolvedValue({
        data: Buffer.from('current'),
        header: Buffer.from('header'),
        ptsUs: 2_006_000n,
        estimatedAgeMs: 0,
        capturedAt: 2_000,
      });
      const barrier = rs.spyOn(manager, 'setFreshnessBarrier');
      const decode = rs
        .spyOn(manager as any, 'decodeH264ToJpeg')
        .mockResolvedValue(jpegFrame());

      await expect(manager.getScreenshotJpeg()).resolves.toEqual(jpegFrame());
      expect(barrier).toHaveBeenCalledWith('stale planning frame');
      expect((manager as any).frameFreshnessBarrierPtsUs).toBe(2_006_000n);
      expect(decode).toHaveBeenCalledWith(
        Buffer.concat([Buffer.from('header'), Buffer.from('current')]),
      );
    });

    it('adds a planning barrier after the new-stream startup window expires', async () => {
      const manager = createManager({} as any);
      (manager as any).spsHeader = Buffer.from('header');
      (manager as any).lastRawKeyframe = Buffer.from('first-planning-backlog');
      (manager as any).lastRawKeyframePtsUs = 1_000_000n;
      (manager as any).streamStartupWindow = {
        deadlineAt: Date.now() - 1,
      };
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 2_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);
      rs.spyOn(manager, 'ensureConnected').mockResolvedValue();
      rs.spyOn(manager as any, 'resetIdleTimer').mockImplementation(() => {});
      rs.spyOn(manager as any, 'waitForNextKeyframe').mockResolvedValue({
        data: Buffer.from('current'),
        header: Buffer.from('header'),
        ptsUs: 2_006_000n,
        estimatedAgeMs: 0,
        capturedAt: 2_000,
      });
      const barrier = rs.spyOn(manager, 'setFreshnessBarrier');
      rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(
        jpegFrame(),
      );

      await expect(manager.getScreenshotJpeg()).resolves.toEqual(jpegFrame());
      expect(barrier).toHaveBeenCalledWith('stale planning frame');
    });

    it('returns a quiet diagnostic when a static screen cannot cross the Planning barrier', async () => {
      const manager = createManager({} as any);
      (manager as any).spsHeader = Buffer.from('old-header');
      (manager as any).lastRawKeyframe = Buffer.from('stale-static-frame');
      (manager as any).lastRawKeyframePtsUs = 1_000_000n;
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 2_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);
      const warn = rs.spyOn(console, 'warn').mockImplementation(() => {});
      const ensureConnected = rs
        .spyOn(manager, 'ensureConnected')
        .mockResolvedValue();
      const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();
      const barrier = rs.spyOn(manager, 'setFreshnessBarrier');
      rs.spyOn(manager as any, 'waitForNextKeyframe').mockRejectedValue(
        new Error('no post-action frame'),
      );
      const decode = rs.spyOn(manager as any, 'decodeH264ToJpeg');

      await expect(manager.getScreenshotJpeg()).rejects.toMatchObject({
        name: 'ScrcpyFreshFrameUnavailableError',
        failureKind: 'freshness-target',
        timeoutMs: 300,
        videoBitRate: 100_000_000,
      });
      expect(ensureConnected).toHaveBeenCalledTimes(1);
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(barrier).toHaveBeenCalledWith('stale planning frame');
      expect(decode).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it('updates capture state when a current deferred keyframe is decoded', async () => {
      const manager = createManager({} as any);
      const currentStreamEpoch = Symbol('current-stream');
      (manager as any).streamEpoch = currentStreamEpoch;
      (manager as any).videoResolution = { width: 1080, height: 1920 };
      (manager as any).streamStartupWindow = {
        deadlineAt: Date.now() + 5_000,
      };
      rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(
        jpegFrame(1200, 2608),
      );

      await expect(
        manager.decodeRawKeyframeToJpeg({
          data: Buffer.from('frame'),
          header: Buffer.from('header'),
          streamEpoch: currentStreamEpoch,
          capturedAt: Date.now(),
        }),
      ).resolves.toEqual(jpegFrame(1200, 2608));

      expect(manager.getResolution()).toEqual({ width: 1200, height: 2608 });
      expect((manager as any).hasEstablishedVideoFrame).toBe(true);
      expect((manager as any).streamStartupWindow).toBeNull();
    });

    it('decodes an untagged keyframe without mutating current stream state', async () => {
      const manager = createManager({} as any);
      const startupWindow = { deadlineAt: Date.now() + 5_000 };
      (manager as any).videoResolution = { width: 1080, height: 1920 };
      (manager as any).streamStartupWindow = startupWindow;
      rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(
        jpegFrame(1200, 2608),
      );

      await expect(
        manager.decodeRawKeyframeToJpeg({
          data: Buffer.from('compatibility-frame'),
          header: Buffer.from('header'),
          capturedAt: Date.now(),
        }),
      ).resolves.toEqual(jpegFrame(1200, 2608));

      expect(manager.getResolution()).toEqual({ width: 1080, height: 1920 });
      expect((manager as any).hasEstablishedVideoFrame).toBe(false);
      expect((manager as any).streamStartupWindow).toBe(startupWindow);
    });

    it('does not let a deferred keyframe from a replaced manager overwrite current state', async () => {
      const oldManager = createManager({} as any);
      const manager = createManager({} as any);
      const startupWindow = { deadlineAt: Date.now() + 5_000 };
      (oldManager as any).advanceStreamEpoch();
      (manager as any).advanceStreamEpoch();
      const oldStreamEpoch = (oldManager as any).streamEpoch;
      expect((manager as any).streamEpoch).not.toBe(oldStreamEpoch);
      (manager as any).videoResolution = { width: 1080, height: 1920 };
      (manager as any).streamStartupWindow = startupWindow;
      rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(
        jpegFrame(1200, 2608),
      );

      await expect(
        manager.decodeRawKeyframeToJpeg({
          data: Buffer.from('old-frame'),
          header: Buffer.from('old-header'),
          streamEpoch: oldStreamEpoch,
          capturedAt: Date.now(),
        }),
      ).resolves.toEqual(jpegFrame(1200, 2608));

      expect(manager.getResolution()).toEqual({ width: 1080, height: 1920 });
      expect((manager as any).hasEstablishedVideoFrame).toBe(false);
      expect((manager as any).streamStartupWindow).toBe(startupWindow);
    });

    it('rejects frames without PTS instead of treating arrival time as freshness', async () => {
      const manager = createManager({} as any);
      (manager as any).spsHeader = Buffer.from('header');
      (manager as any).lastRawKeyframe = Buffer.from('no-pts');
      (manager as any).deviceClockCalibration = {
        deviceUptimeUs: 1_000_000n,
        hostMonotonicUs: 10_000_000n,
        hostWallTimeMs: 2_000,
        roundTripUs: 10_000n,
      };
      rs.spyOn(manager, 'ensureConnected').mockResolvedValue();
      rs.spyOn(manager, 'disconnect').mockResolvedValue();

      await expect(manager.getScreenshotJpeg()).rejects.toThrow(
        /has no PTS metadata/,
      );
    });
  });

  describe('disconnect', () => {
    it('should reset all state', async () => {
      const manager = createManager({} as any);
      // Manually populate state to verify cleanup
      (manager as any).spsHeader = Buffer.from('sps');
      (manager as any).lastRawKeyframe = Buffer.from('keyframe');
      (manager as any).isInitialized = true;
      (manager as any).keyframeResolvers = [() => {}];
      (manager as any).streamReader = { cancel: rs.fn() };
      (manager as any).frameFreshnessBarrierPtsUs = 123n;
      (manager as any).deviceClockCalibration = {};
      (manager as any).lastFramePtsUs = 456n;
      (manager as any).frameFreshnessError = new Error('stale');
      (manager as any).hasEstablishedVideoFrame = true;
      (manager as any).videoResetState = { frameAccepted: true };
      (manager as any).streamStartupWindow = {
        deadlineAt: Date.now() + 5_000,
      };

      await manager.disconnect();

      expect((manager as any).spsHeader).toBeNull();
      expect((manager as any).lastRawKeyframe).toBeNull();
      expect((manager as any).isInitialized).toBe(false);
      expect((manager as any).keyframeResolvers).toEqual([]);
      expect((manager as any).videoStream).toBeNull();
      expect((manager as any).scrcpyClient).toBeNull();
      expect((manager as any).streamReader).toBeNull();
      expect((manager as any).frameFreshnessBarrierPtsUs).toBeNull();
      expect((manager as any).deviceClockCalibration).toBeNull();
      expect((manager as any).lastFramePtsUs).toBeNull();
      expect((manager as any).frameFreshnessError).toBeNull();
      expect((manager as any).hasEstablishedVideoFrame).toBe(false);
      expect((manager as any).videoResetState).toBeNull();
      expect((manager as any).streamStartupWindow).toBeNull();
    });

    it('should clear idle timer', async () => {
      const manager = createManager({} as any);
      const timer = setTimeout(() => {}, 10000);
      (manager as any).idleTimer = timer;

      await manager.disconnect();

      expect((manager as any).idleTimer).toBeNull();
    });

    it('should handle scrcpyClient.close() error gracefully', async () => {
      const manager = createManager({} as any);
      (manager as any).scrcpyClient = {
        close: rs.fn().mockRejectedValue(new Error('close failed')),
      };

      // Should not throw
      await expect(manager.disconnect()).resolves.toBeUndefined();
      // References are nulled before close is called
      expect((manager as any).scrcpyClient).toBeNull();
    });

    it('closes the owned ADB transport only when permanently disposed', async () => {
      const close = rs.fn().mockResolvedValue(undefined);
      const manager = createManager({ close } as any);

      await manager.disconnect();
      expect(close).not.toHaveBeenCalled();

      await manager.dispose();
      await manager.dispose();
      expect(close).toHaveBeenCalledTimes(1);
      await expect(manager.ensureConnected()).rejects.toThrow(
        'Scrcpy manager has been disposed',
      );
    });

    it('shares one complete disposal across concurrent callers', async () => {
      let finishClose: (() => void) | undefined;
      const close = rs.fn().mockReturnValue(
        new Promise<void>((resolve) => {
          finishClose = resolve;
        }),
      );
      const manager = createManager({ close } as any);

      const firstDispose = manager.dispose();
      const secondDispose = manager.dispose();
      let secondFinished = false;
      void secondDispose.then(() => {
        secondFinished = true;
      });

      await Promise.resolve();
      expect(secondFinished).toBe(false);
      expect(close).toHaveBeenCalledTimes(1);

      finishClose?.();
      await expect(Promise.all([firstDispose, secondDispose])).resolves.toEqual(
        [undefined, undefined],
      );
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('waits for an in-flight connection before disposing its ADB transport', async () => {
      const close = rs.fn().mockResolvedValue(undefined);
      const manager = createManager({ close } as any);
      let resolveConnection: (() => void) | undefined;
      rs.spyOn(manager as any, 'connectScrcpy').mockReturnValue(
        new Promise<void>((resolve) => {
          resolveConnection = resolve;
        }),
      );

      const connecting = manager.ensureConnected();
      const disposing = manager.dispose();
      expect(close).not.toHaveBeenCalled();
      resolveConnection?.();

      await expect(Promise.all([connecting, disposing])).resolves.toEqual([
        undefined,
        undefined,
      ]);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('should cancel streamReader to stop consumeFramesLoop', async () => {
      const manager = createManager({} as any);
      const cancelFn = rs.fn().mockResolvedValue(undefined);
      (manager as any).streamReader = { cancel: cancelFn };

      await manager.disconnect();

      expect(cancelFn).toHaveBeenCalled();
      expect((manager as any).streamReader).toBeNull();
    });

    it('should wait for asynchronous streamReader cancellation', async () => {
      const manager = createManager({} as any);
      let resolveCancel: (() => void) | undefined;
      const cancelPromise = new Promise<void>((resolve) => {
        resolveCancel = resolve;
      });
      (manager as any).streamReader = {
        cancel: rs.fn().mockReturnValue(cancelPromise),
      };

      let disconnected = false;
      const disconnectPromise = manager.disconnect().then(() => {
        disconnected = true;
      });
      await Promise.resolve();

      expect(disconnected).toBe(false);

      resolveCancel?.();
      await disconnectPromise;
      expect(disconnected).toBe(true);
    });

    it('should handle streamReader.cancel() error gracefully', async () => {
      const manager = createManager({} as any);
      (manager as any).streamReader = {
        cancel: rs.fn().mockRejectedValue(new Error('stream already errored')),
      };

      await expect(manager.disconnect()).resolves.toBeUndefined();
      expect((manager as any).streamReader).toBeNull();
    });

    it('should null references before awaiting close to prevent race conditions', async () => {
      const manager = createManager({} as any);
      let clientNulledBeforeClose = false;
      (manager as any).scrcpyClient = {
        close: rs.fn().mockImplementation(async () => {
          // At this point, scrcpyClient should already be null
          clientNulledBeforeClose = (manager as any).scrcpyClient === null;
        }),
      };
      (manager as any).videoStream = {};

      await manager.disconnect();

      expect(clientNulledBeforeClose).toBe(true);
      expect((manager as any).videoStream).toBeNull();
    });
  });
});
