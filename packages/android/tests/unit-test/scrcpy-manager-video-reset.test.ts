import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  ScrcpyScreenshotManager,
  type ScrcpyServerPusher,
} from '../../src/scrcpy-manager';

const noopPushServer: ScrcpyServerPusher = async () => {};
const createManager = (
  adb: ConstructorParameters<typeof ScrcpyScreenshotManager>[0],
  options: ConstructorParameters<typeof ScrcpyScreenshotManager>[2] = {},
) => new ScrcpyScreenshotManager(adb, noopPushServer, options);

const prepareEstablishedStaleManager = (
  manager: ScrcpyScreenshotManager,
  resetVideo: () => Promise<void>,
  options: {
    hostWallTimeMs?: number;
    clientExtras?: Record<string, unknown>;
  } = {},
) => {
  const internals = manager as any;
  internals.hasEstablishedVideoFrame = true;
  internals.scrcpyClient = {
    ...options.clientExtras,
    controller: { resetVideo },
  };
  internals.spsHeader = Buffer.from('old-header');
  internals.lastRawKeyframe = Buffer.from('stale-static-frame');
  internals.lastRawKeyframePtsUs = 1_000_000n;
  internals.deviceClockCalibration = {
    deviceUptimeUs: 2_000_000n,
    hostMonotonicUs: 10_000_000n,
    hostWallTimeMs: options.hostWallTimeMs ?? 2_000,
    roundTripUs: 10_000n,
  };
  rs.spyOn(internals, 'monotonicTimeUs').mockReturnValue(10_000_000n);
  rs.spyOn(manager, 'ensureConnected').mockResolvedValue();
  rs.spyOn(internals, 'resetIdleTimer').mockImplementation(() => {});
};

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

describe('ScrcpyScreenshotManager video reset', () => {
  afterEach(() => {
    rs.useRealTimers();
    rs.restoreAllMocks();
  });

  it('resets an established static video stream before closing the connection', async () => {
    const resetVideo = rs.fn().mockResolvedValue(undefined);
    const manager = createManager({} as any);
    prepareEstablishedStaleManager(manager, resetVideo);
    const freshFrame = {
      data: Buffer.from('post-reset-frame'),
      header: Buffer.from('new-header'),
      ptsUs: 2_006_000n,
      estimatedAgeMs: 0,
      capturedAt: 2_000,
    };
    const waitForNextKeyframe = rs
      .spyOn(manager as any, 'waitForNextKeyframe')
      .mockRejectedValueOnce(new Error('no natural frame within 10ms'))
      .mockImplementationOnce(async () => ({
        ...freshFrame,
        streamEpoch: (manager as any).streamEpoch,
      }));
    const barrier = rs.spyOn(manager, 'setFreshnessBarrier');
    const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();
    rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(
      jpegFrame(1200, 2608),
    );
    const streamEpochBeforeReset = (manager as any).streamEpoch;

    await expect(manager.getScreenshotJpeg()).resolves.toEqual(
      jpegFrame(1200, 2608),
    );

    expect(waitForNextKeyframe.mock.calls[0][0]).toBe(10);
    expect(resetVideo).toHaveBeenCalledTimes(1);
    expect((manager as any).streamEpoch).not.toBe(streamEpochBeforeReset);
    expect(barrier).toHaveBeenCalledOnce();
    expect(barrier).toHaveBeenCalledWith('stale planning frame');
    expect(disconnect).not.toHaveBeenCalled();
    expect(manager.getResolution()).toEqual({ width: 1200, height: 2608 });
  });

  it('uses a natural fresh frame without resetting video when it arrives within 10ms', async () => {
    const resetVideo = rs.fn().mockResolvedValue(undefined);
    const manager = createManager({} as any);
    prepareEstablishedStaleManager(manager, resetVideo);
    (manager as any).spsHeader = Buffer.from('header');
    const waitForNextKeyframe = rs
      .spyOn(manager as any, 'waitForNextKeyframe')
      .mockResolvedValue({
        data: Buffer.from('natural-frame'),
        header: Buffer.from('header'),
        ptsUs: 2_000_000n,
        estimatedAgeMs: 0,
        streamEpoch: (manager as any).streamEpoch,
        capturedAt: 2_000,
      });
    rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(jpegFrame());

    await expect(manager.getScreenshotJpeg()).resolves.toEqual(jpegFrame());

    expect(waitForNextKeyframe).toHaveBeenCalledWith(10);
    expect(resetVideo).not.toHaveBeenCalled();
  });

  it('uses a post-reset frame that arrives before the control write settles', async () => {
    let finishReset: (() => void) | undefined;
    const resetVideo = rs.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        finishReset = resolve;
      }),
    );
    const manager = createManager({} as any);
    prepareEstablishedStaleManager(manager, resetVideo);
    const waitForNextKeyframe = rs
      .spyOn(manager as any, 'waitForNextKeyframe')
      .mockRejectedValueOnce(new Error('no natural frame within 10ms'));
    rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(jpegFrame());

    const capture = manager.getScreenshotJpeg();
    await rs.waitFor(() => expect(resetVideo).toHaveBeenCalledTimes(1));
    (manager as any).processFrame(spsPacket());
    (manager as any).processFrame(dataPacket(0x01, 2_006_000n));
    finishReset?.();

    await expect(capture).resolves.toEqual(jpegFrame());
    expect(waitForNextKeyframe).toHaveBeenCalledTimes(1);
  });

  it('waits up to 800ms after a successful reset control write by default', async () => {
    rs.useFakeTimers();
    rs.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    const resetVideo = rs.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 75);
        }),
    );
    const close = rs.fn().mockResolvedValue(undefined);
    const manager = createManager({} as any);
    prepareEstablishedStaleManager(manager, resetVideo, {
      hostWallTimeMs: Date.now(),
      clientExtras: { close },
    });
    const waitForNextKeyframe = rs
      .spyOn(manager as any, 'waitForNextKeyframe')
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(
              () => reject(new Error('no natural frame within 10ms')),
              10,
            );
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  data: Buffer.from('delayed-post-reset-frame'),
                  header: Buffer.from('new-header'),
                  ptsUs: 2_006_000n,
                  estimatedAgeMs: 0,
                  streamEpoch: (manager as any).streamEpoch,
                  capturedAt: Date.now(),
                }),
              650,
            );
          }),
      );
    rs.spyOn(manager as any, 'decodeH264ToJpeg').mockResolvedValue(jpegFrame());

    const capture = manager.getScreenshotJpeg();
    await rs.advanceTimersByTimeAsync(10);
    expect(resetVideo).toHaveBeenCalledTimes(1);
    await rs.advanceTimersByTimeAsync(74);
    expect(waitForNextKeyframe).toHaveBeenCalledTimes(1);
    await rs.advanceTimersByTimeAsync(1);
    expect(waitForNextKeyframe).toHaveBeenCalledTimes(2);
    await rs.advanceTimersByTimeAsync(649);
    expect(close).not.toHaveBeenCalled();
    await rs.advanceTimersByTimeAsync(1);

    await expect(capture).resolves.toEqual(jpegFrame());
    expect(waitForNextKeyframe.mock.calls[1][0]).toBe(800);
    expect(close).not.toHaveBeenCalled();
  });

  it('shares one video reset across concurrent recovery callers', async () => {
    let finishReset: (() => void) | undefined;
    const resetVideo = rs.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        finishReset = resolve;
      }),
    );
    const manager = createManager({} as any);
    (manager as any).scrcpyClient = { controller: { resetVideo } };
    (manager as any).deviceClockCalibration = {
      deviceUptimeUs: 2_000_000n,
      hostMonotonicUs: 10_000_000n,
      hostWallTimeMs: 2_000,
      roundTripUs: 10_000n,
    };
    rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);

    const first = (manager as any).requestVideoReset();
    const second = (manager as any).requestVideoReset();
    await rs.waitFor(() => expect(resetVideo).toHaveBeenCalledTimes(1));
    finishReset?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(resetVideo).toHaveBeenCalledTimes(1);
  });

  it('keeps reset singleflight ownership until both the write and a new frame complete', async () => {
    let finishReset: (() => void) | undefined;
    const resetVideo = rs.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        finishReset = resolve;
      }),
    );
    const manager = createManager({} as any);
    (manager as any).scrcpyClient = { controller: { resetVideo } };
    (manager as any).deviceClockCalibration = {
      deviceUptimeUs: 2_000_000n,
      hostMonotonicUs: 10_000_000n,
      hostWallTimeMs: 2_000,
      roundTripUs: 10_000n,
    };
    rs.spyOn(manager as any, 'monotonicTimeUs').mockReturnValue(10_000_000n);

    const first = (manager as any).requestVideoReset();
    await rs.waitFor(() => expect(resetVideo).toHaveBeenCalledTimes(1));
    (manager as any).processFrame(spsPacket());
    (manager as any).processFrame(dataPacket(0x01, 2_000_000n));
    expect((manager as any).videoResetState?.frameAccepted).toBe(true);

    const second = (manager as any).requestVideoReset();
    expect(resetVideo).toHaveBeenCalledTimes(1);
    finishReset?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(resetVideo).toHaveBeenCalledTimes(1);
    expect((manager as any).videoResetState).toBeNull();
  });

  it('restores the prior SPS header when the reset control write fails', async () => {
    const manager = createManager({} as any);
    const oldHeader = Buffer.from('old-header');
    (manager as any).spsHeader = oldHeader;
    (manager as any).scrcpyClient = {
      controller: {
        resetVideo: rs
          .fn()
          .mockRejectedValue(new Error('control stream write failed')),
      },
    };

    await expect((manager as any).requestVideoReset()).rejects.toThrow(
      'control stream write failed',
    );

    expect((manager as any).spsHeader).toEqual(oldHeader);
    expect((manager as any).videoResetState).toBeNull();
  });

  it('bounds a blocked reset write by the original 300ms capture deadline', async () => {
    rs.useFakeTimers();
    rs.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    const resetVideo = rs.fn().mockReturnValue(new Promise<void>(() => {}));
    const close = rs.fn().mockResolvedValue(undefined);
    const manager = createManager({} as any);
    prepareEstablishedStaleManager(manager, resetVideo, {
      hostWallTimeMs: Date.now(),
      clientExtras: { close },
    });

    const capture = expect(manager.getScreenshotJpeg()).rejects.toMatchObject({
      name: 'ScrcpyFreshFrameUnavailableError',
      timeoutMs: 300,
    });
    await rs.advanceTimersByTimeAsync(299);
    expect(close).not.toHaveBeenCalled();
    await rs.advanceTimersByTimeAsync(1);

    await capture;
    expect(resetVideo).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect((manager as any).videoResetState).toBeNull();
  });

  it('falls back to closing the stream when video reset cannot produce a frame', async () => {
    const resetVideo = rs
      .fn()
      .mockRejectedValue(new Error('control stream write failed'));
    const manager = createManager({} as any);
    prepareEstablishedStaleManager(manager, resetVideo);
    rs.spyOn(manager as any, 'waitForNextKeyframe')
      .mockRejectedValueOnce(new Error('no natural frame within 10ms'))
      .mockRejectedValueOnce(new Error('no frame after reset attempt'));
    const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();

    await expect(manager.getScreenshotJpeg()).rejects.toMatchObject({
      name: 'ScrcpyFreshFrameUnavailableError',
      failureKind: 'freshness-target',
    });

    expect(resetVideo).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports when a successful reset produces no data frames within 800ms', async () => {
    rs.useFakeTimers();
    rs.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    const resetVideo = rs.fn().mockResolvedValue(undefined);
    const manager = createManager({} as any);
    prepareEstablishedStaleManager(manager, resetVideo, {
      hostWallTimeMs: Date.now(),
    });
    const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();

    const capture = expect(manager.getScreenshotJpeg()).rejects.toMatchObject({
      name: 'ScrcpyFreshFrameUnavailableError',
      timeoutMs: 800,
      message: expect.stringContaining(
        'no data packets were observed while reset recovery was active',
      ),
    });
    await rs.advanceTimersByTimeAsync(0);
    await rs.advanceTimersByTimeAsync(9);
    expect(resetVideo).not.toHaveBeenCalled();
    expect(disconnect).not.toHaveBeenCalled();

    await rs.advanceTimersByTimeAsync(1);
    expect(resetVideo).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();

    await rs.advanceTimersByTimeAsync(799);
    expect(disconnect).not.toHaveBeenCalled();
    await rs.advanceTimersByTimeAsync(1);

    await capture;
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports unusable data packets observed while reset recovery is active', async () => {
    rs.useFakeTimers();
    rs.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    const resetVideo = rs.fn().mockResolvedValue(undefined);
    const manager = createManager({} as any, {
      videoResetFrameTimeoutMs: 950,
    });
    prepareEstablishedStaleManager(manager, resetVideo, {
      hostWallTimeMs: Date.now(),
    });
    const disconnect = rs.spyOn(manager, 'disconnect').mockResolvedValue();

    const capture = expect(manager.getScreenshotJpeg()).rejects.toMatchObject({
      name: 'ScrcpyFreshFrameUnavailableError',
      timeoutMs: 950,
      message: expect.stringContaining(
        '1 data packet was observed while reset recovery was active',
      ),
    });
    await rs.advanceTimersByTimeAsync(10);
    (manager as any).processFrame(spsPacket());
    (manager as any).processFrame(dataPacket(0x01, 2_005_000n));
    await rs.advanceTimersByTimeAsync(950);

    await capture;
    expect(resetVideo).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('observes a reset rejection that arrives after the caller deadline', async () => {
    rs.useFakeTimers();
    let rejectReset: ((reason: Error) => void) | undefined;
    const resetVideo = rs.fn().mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        rejectReset = reject;
      }),
    );
    const manager = createManager({} as any);
    const oldHeader = Buffer.from('old-header');
    (manager as any).spsHeader = oldHeader;
    (manager as any).scrcpyClient = { controller: { resetVideo } };

    const resetOutcome = expect(
      (manager as any).requestVideoReset(Date.now() + 50),
    ).rejects.toThrow(/exceeded the freshness deadline/);
    await rs.advanceTimersByTimeAsync(50);
    await resetOutcome;

    rejectReset?.(new Error('late control stream rejection'));
    await rs.advanceTimersByTimeAsync(0);

    expect((manager as any).spsHeader).toEqual(oldHeader);
    expect((manager as any).videoResetState).toBeNull();
  });

  it('does not wait for a blocked RESET_VIDEO control write', async () => {
    rs.useFakeTimers();
    const resetVideo = rs.fn().mockReturnValue(new Promise<void>(() => {}));
    const close = rs.fn().mockResolvedValue(undefined);
    const manager = createManager({} as any);
    (manager as any).hasEstablishedVideoFrame = true;
    (manager as any).streamStartupWindow = { deadlineAt: Date.now() + 5_000 };
    (manager as any).scrcpyClient = {
      controller: { resetVideo },
      close,
    };

    const resetRequest = (manager as any).requestVideoReset();
    const resetOutcome = expect(resetRequest).rejects.toThrow(
      /exceeded the freshness deadline/,
    );
    await rs.advanceTimersByTimeAsync(0);
    expect(resetVideo).toHaveBeenCalledTimes(1);

    await expect(manager.disconnect()).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1);
    expect((manager as any).videoResetState).toBeNull();
    expect((manager as any).hasEstablishedVideoFrame).toBe(false);
    expect((manager as any).streamStartupWindow).toBeNull();

    await rs.advanceTimersByTimeAsync(300);
    await resetOutcome;
  });
});
