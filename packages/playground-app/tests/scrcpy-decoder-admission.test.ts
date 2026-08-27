import { describe, expect, test } from '@rstest/core';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { createBoundedScrcpyDecoderWritable } from '../src/scrcpy-decoder-admission';
import type { ScrcpyVideoStreamPacket } from '../src/scrcpy-stream';

function packet(
  sequence: number,
  options: {
    keyframe?: boolean;
    receivedAt?: number;
    type?: 'configuration';
  } = {},
): ScrcpyVideoStreamPacket {
  const receivedAt = options.receivedAt ?? 1_000;
  const media: ScrcpyMediaStreamPacket =
    options.type === 'configuration'
      ? { type: 'configuration', data: new Uint8Array([sequence]) }
      : {
          type: 'data',
          data: new Uint8Array([sequence]),
          keyframe: options.keyframe,
        };
  return {
    media,
    receivedAt,
    transport: {
      sequence,
      receivedAt,
      sentAt: receivedAt,
      timestamp: receivedAt,
    },
  };
}

function createDecoder() {
  const submitted: ScrcpyMediaStreamPacket[] = [];
  const decoder = {
    framesRendered: 0,
    framesSkipped: 0,
    writable: new WritableStream<ScrcpyMediaStreamPacket>({
      write(media) {
        submitted.push(media);
      },
    }),
  };
  return { decoder, submitted };
}

describe('bounded scrcpy decoder admission', () => {
  test('bounds synchronous decoder submissions and resumes from a keyframe', async () => {
    const { decoder, submitted } = createDecoder();
    let releaseProgress: (() => void) | undefined;
    const writer = createBoundedScrcpyDecoderWritable(decoder, {
      maxDecoderBacklog: 1,
      now: () => 1_100,
      waitForDecoderProgress: () =>
        new Promise<void>((resolve) => {
          releaseProgress = resolve;
        }),
    }).getWriter();

    await writer.write(packet(0, { type: 'configuration' }));
    await writer.write(packet(1, { keyframe: true }));
    await writer.write(packet(2));
    expect(submitted.map((item) => item.data[0])).toEqual([0, 1]);

    const retainedKeyframe = writer.write(packet(3, { keyframe: true }));
    await Promise.resolve();
    expect(submitted.map((item) => item.data[0])).toEqual([0, 1]);

    decoder.framesSkipped = 1;
    releaseProgress?.();
    await retainedKeyframe;
    expect(submitted.map((item) => item.data[0])).toEqual([0, 1, 3]);
    await writer.close();
  });

  test('rechecks retained keyframe age immediately before decode', async () => {
    const { decoder, submitted } = createDecoder();
    let currentTime = 1_100;
    let releaseProgress: (() => void) | undefined;
    const writer = createBoundedScrcpyDecoderWritable(decoder, {
      maxDecoderBacklog: 1,
      maxPacketAgeMs: 500,
      now: () => currentTime,
      waitForDecoderProgress: () =>
        new Promise<void>((resolve) => {
          releaseProgress = resolve;
        }),
    }).getWriter();

    await writer.write(packet(0, { type: 'configuration' }));
    await writer.write(packet(1, { keyframe: true }));
    const retainedKeyframe = writer.write(
      packet(2, { keyframe: true, receivedAt: 1_000 }),
    );
    await Promise.resolve();

    currentTime = 1_600;
    releaseProgress?.();
    await retainedKeyframe;
    expect(submitted.map((item) => item.data[0])).toEqual([0, 1]);
    await writer.close();
  });

  test('requires a keyframe after a sequence gap at decoder boundary', async () => {
    const { decoder, submitted } = createDecoder();
    const writer = createBoundedScrcpyDecoderWritable(decoder, {
      maxDecoderBacklog: 10,
      now: () => 1_100,
    }).getWriter();

    await writer.write(packet(0, { type: 'configuration' }));
    await writer.write(packet(1, { keyframe: true }));
    await writer.write(packet(3));
    await writer.write(packet(4));
    await writer.write(packet(5, { keyframe: true }));

    expect(submitted.map((item) => item.data[0])).toEqual([0, 1, 5]);
    await writer.close();
  });
});
