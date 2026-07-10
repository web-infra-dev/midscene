import { afterEach, describe, expect, it, vi } from 'vitest';
import { AndroidDevice } from '../../src/device';
import {
  type RawKeyframe,
  ScrcpyScreenshotManager,
} from '../../src/scrcpy-manager';

// A minimal H.264 "keyframe": 4-byte start code + IDR NAL (type 5).
const idrFrame = (tag: number): Buffer =>
  Buffer.from([0x00, 0x00, 0x00, 0x01, 0x65, tag]);
const spsPacket = (): { type: string; data: Buffer } => ({
  type: 'configuration',
  data: Buffer.from([0x00, 0x00, 0x00, 0x01, 0x67, 0xaa]),
});
const dataPacket = (tag: number): { type: string; data: Buffer } => ({
  type: 'data',
  data: idrFrame(tag),
});

describe('ScrcpyScreenshotManager keyframe subscription', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fans out raw keyframes (with header + ts) to subscribers', () => {
    const manager = new ScrcpyScreenshotManager({} as any);
    const received: RawKeyframe[] = [];
    manager.subscribeKeyframes((frame) => received.push(frame));

    (manager as any).processFrame(spsPacket());
    (manager as any).processFrame(dataPacket(0x01));
    (manager as any).processFrame(dataPacket(0x02));

    expect(received).toHaveLength(2);
    expect(received[0].data[5]).toBe(0x01);
    expect(received[1].data[5]).toBe(0x02);
    // header is the SPS/PPS configuration buffer
    expect(received[0].header[4]).toBe(0x67);
    expect(received[0].capturedAt).toBeGreaterThan(0);
  });

  it('stops delivering after unsubscribe', () => {
    const manager = new ScrcpyScreenshotManager({} as any);
    const received: RawKeyframe[] = [];
    const unsubscribe = manager.subscribeKeyframes((f) => received.push(f));

    (manager as any).processFrame(spsPacket());
    (manager as any).processFrame(dataPacket(0x01));
    unsubscribe();
    (manager as any).processFrame(dataPacket(0x02));

    expect(received).toHaveLength(1);
  });

  it('keeps the connection alive while subscribed (resets idle timer per frame)', () => {
    const manager = new ScrcpyScreenshotManager({} as any);
    const resetSpy = vi.spyOn(manager as any, 'resetIdleTimer');
    manager.subscribeKeyframes(() => {});
    resetSpy.mockClear();

    (manager as any).processFrame(spsPacket());
    (manager as any).processFrame(dataPacket(0x01));
    (manager as any).processFrame(dataPacket(0x02));

    expect(resetSpy).toHaveBeenCalledTimes(2);
  });

  it('exposes the latest raw keyframe', () => {
    const manager = new ScrcpyScreenshotManager({} as any);
    expect(manager.getLatestRawKeyframe()).toBeNull();

    (manager as any).processFrame(spsPacket());
    (manager as any).processFrame(dataPacket(0x07));

    const latest = manager.getLatestRawKeyframe();
    expect(latest?.data[5]).toBe(0x07);
  });
});

describe('AndroidDevice frame-source capability', () => {
  it('is not exposed by default (opt-in, mirrors iOS)', () => {
    const device = new AndroidDevice('device-1', {});
    expect(device.openFrameSource).toBeUndefined();
  });

  it('is exposed when scrcpy is explicitly enabled', () => {
    const device = new AndroidDevice('device-1', {
      scrcpyConfig: { enabled: true },
    });
    expect(typeof device.openFrameSource).toBe('function');
  });

  it('hands out raw keyframe refs and defers ffmpeg decode to decode()', async () => {
    const device = new AndroidDevice('device-1', {
      scrcpyConfig: { enabled: true },
    });

    let listener: ((f: RawKeyframe) => void) | undefined;
    const frameA: RawKeyframe = {
      data: idrFrame(0x0a),
      header: Buffer.from([0x67]),
      capturedAt: 1000,
    };
    const frameB: RawKeyframe = {
      data: idrFrame(0x0b),
      header: Buffer.from([0x67]),
      capturedAt: 2000,
    };
    const decode = vi
      .fn()
      .mockImplementation(async (f: RawKeyframe) => `decoded-${f.data[5]}`);
    const unsubscribe = vi.fn();
    (device as any).scrcpyAdapter = {
      isEnabled: () => true,
      getLatestRawKeyframe: () => frameA,
      subscribeKeyframes: vi.fn().mockImplementation(async (_info, cb) => {
        listener = cb;
        return unsubscribe;
      }),
      decodeRawKeyframeToJpegBase64: decode,
    };
    (device as any).getDevicePhysicalInfo = vi.fn().mockResolvedValue({});

    const source = await device.openFrameSource!();
    expect(source).toBeDefined();

    // latest() tracks the stream without any decoding
    expect(source!.latest()?.ref).toBe(frameA);
    listener?.(frameB);
    expect(source!.latest()?.ref).toBe(frameB);
    expect(source!.latest()?.capturedAt).toBe(2000);
    expect(decode).not.toHaveBeenCalled();

    // decode() materializes exactly the sampled refs, in order
    const images = await source!.decode([
      { ref: frameA, capturedAt: 1000 },
      { ref: frameB, capturedAt: 2000 },
    ]);
    expect(images).toEqual(['decoded-10', 'decoded-11']);
    expect(decode).toHaveBeenCalledTimes(2);

    // stop() releases the subscription (which also released the keepalive)
    await source!.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('throws when scrcpy is unavailable so observers can fall back', async () => {
    const device = new AndroidDevice('device-1', {
      scrcpyConfig: { enabled: true },
    });
    (device as any).scrcpyAdapter = { isEnabled: () => false };

    await expect(device.openFrameSource!()).rejects.toThrow(
      /scrcpy is not available/,
    );
  });
});
