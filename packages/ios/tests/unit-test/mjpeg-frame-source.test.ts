import { describe, expect, it } from 'vitest';
import { IOSDevice } from '../../src/device';
import {
  MjpegFrameSource,
  extractJpegFrames,
} from '../../src/mjpeg-frame-source';

// A minimal "JPEG": SOI (FF D8) + a tag byte + EOI (FF D9).
const jpeg = (tag: number): Buffer =>
  Buffer.from([0xff, 0xd8, tag, 0xff, 0xd9]);

describe('extractJpegFrames', () => {
  it('extracts a single complete frame and leaves no remainder', () => {
    const { frames, rest } = extractJpegFrames(jpeg(0x01));
    expect(frames).toHaveLength(1);
    expect([...frames[0]]).toEqual([0xff, 0xd8, 0x01, 0xff, 0xd9]);
    expect(rest).toHaveLength(0);
  });

  it('extracts multiple frames in order', () => {
    const buf = Buffer.concat([jpeg(0x01), jpeg(0x02), jpeg(0x03)]);
    const { frames, rest } = extractJpegFrames(buf);
    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f[2])).toEqual([0x01, 0x02, 0x03]);
    expect(rest).toHaveLength(0);
  });

  it('ignores boundary/header bytes before the SOI', () => {
    const boundary = Buffer.from(
      '--BoundaryString\r\nContent-Type: image/jpeg\r\n\r\n',
    );
    const { frames, rest } = extractJpegFrames(
      Buffer.concat([boundary, jpeg(0x07)]),
    );
    expect(frames).toHaveLength(1);
    expect(frames[0][2]).toBe(0x07);
    expect(rest).toHaveLength(0);
  });

  it('carries an incomplete frame (SOI without EOI) into rest', () => {
    const partial = Buffer.from([0xff, 0xd8, 0xaa, 0xbb]); // no EOI yet
    const { frames, rest } = extractJpegFrames(partial);
    expect(frames).toHaveLength(0);
    expect([...rest]).toEqual([0xff, 0xd8, 0xaa, 0xbb]);
  });

  it('reassembles a frame split across two chunks', () => {
    const full = jpeg(0x42);
    const chunkA = full.subarray(0, 3); // FF D8 42
    const chunkB = full.subarray(3); // FF D9

    const first = extractJpegFrames(chunkA);
    expect(first.frames).toHaveLength(0);

    const second = extractJpegFrames(Buffer.concat([first.rest, chunkB]));
    expect(second.frames).toHaveLength(1);
    expect(second.frames[0][2]).toBe(0x42);
    expect(second.rest).toHaveLength(0);
  });

  it('keeps a trailing 0xFF that may begin a split SOI marker', () => {
    const { frames, rest } = extractJpegFrames(
      Buffer.concat([jpeg(0x01), Buffer.from([0xff])]),
    );
    expect(frames).toHaveLength(1);
    expect([...rest]).toEqual([0xff]);
  });
});

describe('IOSDevice MJPEG frame source opt-in', () => {
  it('does not expose captureFrameSequence by default', () => {
    const device = new IOSDevice({ wdaMjpegPort: 9123 });
    expect(device.captureFrameSequence).toBeUndefined();
  });

  it('exposes captureFrameSequence when explicitly enabled', () => {
    const device = new IOSDevice({
      wdaMjpegPort: 9123,
      wdaMjpegFrameSource: { enabled: true },
    });
    expect(typeof device.captureFrameSequence).toBe('function');
  });

  it('builds the stream URL from the per-device wdaMjpegPort (multi-device)', () => {
    const a = new IOSDevice({ wdaHost: '127.0.0.1', wdaMjpegPort: 9101 });
    const b = new IOSDevice({ wdaHost: '127.0.0.1', wdaMjpegPort: 9102 });
    expect(a.mjpegStreamUrl).toBe('http://127.0.0.1:9101');
    expect(b.mjpegStreamUrl).toBe('http://127.0.0.1:9102');
  });
});

describe('MjpegFrameSource', () => {
  it('decodes frames from a streamed MJPEG response and exposes the latest', async () => {
    const full = Buffer.concat([jpeg(0x01), jpeg(0x02)]);
    const body = {
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array(full.subarray(0, 4));
        yield new Uint8Array(full.subarray(4));
      },
    };
    const fetchMock = async () =>
      ({ ok: true, status: 200, body }) as unknown as Response;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = fetchMock;

    try {
      let t = 1000;
      const source = new MjpegFrameSource('http://localhost:9100', () => t++);
      await source.ensureStarted(2000);
      const latest = source.getLatest();
      expect(latest).not.toBeNull();
      expect(latest?.base64.startsWith('data:image/jpeg;base64,')).toBe(true);
      // last frame in the stream is jpeg(0x02)
      const decoded = Buffer.from(
        latest!.base64.replace('data:image/jpeg;base64,', ''),
        'base64',
      );
      expect(decoded[2]).toBe(0x02);
      source.stop();
    } finally {
      (globalThis as any).fetch = originalFetch;
    }
  });
});
