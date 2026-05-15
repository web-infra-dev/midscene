import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { describe, expect, test } from 'vitest';
import { createScrcpyVideoStream } from '../src/scrcpy-stream';

interface RawVideoPayload {
  type?: string;
  data: ArrayBuffer | ArrayBufferView;
  keyFrame?: boolean;
}

type VideoDataHandler = (data: RawVideoPayload) => void;
type VoidHandler = () => void;
type ErrorHandler = (error: Error) => void;

class MockScrcpySocket {
  private videoDataHandlers = new Set<VideoDataHandler>();
  private disconnectHandlers = new Set<VoidHandler>();
  private errorHandlers = new Set<ErrorHandler>();
  readonly subscribedEvents: string[] = [];

  on(event: 'video-data', handler: VideoDataHandler): void;
  on(event: 'disconnect', handler: VoidHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(
    event: 'video-data' | 'disconnect' | 'error',
    handler: VideoDataHandler | VoidHandler | ErrorHandler,
  ): void {
    this.subscribedEvents.push(event);
    if (event === 'video-data') {
      this.videoDataHandlers.add(handler as VideoDataHandler);
      return;
    }

    if (event === 'disconnect') {
      this.disconnectHandlers.add(handler as VoidHandler);
      return;
    }

    this.errorHandlers.add(handler as ErrorHandler);
  }

  off(event: 'video-data', handler: VideoDataHandler): void;
  off(event: 'disconnect', handler: VoidHandler): void;
  off(event: 'error', handler: ErrorHandler): void;
  off(
    event: 'video-data' | 'disconnect' | 'error',
    handler: VideoDataHandler | VoidHandler | ErrorHandler,
  ): void {
    if (event === 'video-data') {
      this.videoDataHandlers.delete(handler as VideoDataHandler);
      return;
    }

    if (event === 'disconnect') {
      this.disconnectHandlers.delete(handler as VoidHandler);
      return;
    }

    this.errorHandlers.delete(handler as ErrorHandler);
  }

  dispatchVideoData(packet: RawVideoPayload) {
    this.videoDataHandlers.forEach((handler) => handler(packet));
  }

  dispatchDisconnect() {
    this.disconnectHandlers.forEach((handler) => handler());
  }
}

async function collectStream(
  stream: ReadableStream<ScrcpyMediaStreamPacket>,
): Promise<ScrcpyMediaStreamPacket[]> {
  const packets: ScrcpyMediaStreamPacket[] = [];
  await stream.pipeTo(
    new WritableStream<ScrcpyMediaStreamPacket>({
      write(packet) {
        packets.push(packet);
      },
    }),
  );
  return packets;
}

describe('createScrcpyVideoStream', () => {
  test('subscribes to scrcpy socket events immediately', () => {
    const socket = new MockScrcpySocket();

    createScrcpyVideoStream(socket);

    expect(socket.subscribedEvents).toEqual([
      'video-data',
      'disconnect',
      'error',
    ]);
  });

  test('buffers frame data until configuration arrives', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket);
    const collected = collectStream(stream);

    socket.dispatchVideoData({ type: 'data', data: new Uint8Array([1, 2, 3]) });
    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([9]),
    });
    socket.dispatchVideoData({ type: 'data', data: new Uint8Array([4, 5, 6]) });
    socket.dispatchDisconnect();

    const packets = await collected;

    expect(
      packets.map((packet) => ({
        type: packet.type,
        data: Array.from(packet.data),
      })),
    ).toEqual([
      { type: 'configuration', data: [9] },
      { type: 'data', data: [1, 2, 3] },
      { type: 'data', data: [4, 5, 6] },
    ]);
  });

  test('propagates keyFrame flag from raw packet as keyframe', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket);
    const collected = collectStream(stream);

    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([0]),
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([1]),
      keyFrame: true,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([2]),
      keyFrame: false,
    });
    socket.dispatchDisconnect();

    const packets = await collected;
    const dataPackets = packets.filter(
      (packet): packet is Extract<ScrcpyMediaStreamPacket, { type: 'data' }> =>
        packet.type === 'data',
    );

    expect(dataPackets).toHaveLength(2);
    expect(dataPackets[0].keyframe).toBe(true);
    expect(dataPackets[1].keyframe).toBe(false);
  });

  test('accepts ArrayBufferView and ArrayBuffer payloads from binary transport', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket);
    const collected = collectStream(stream);

    const sourceBytes = new Uint8Array([99, 10, 20, 30, 88]);
    const configBytes = new DataView(sourceBytes.buffer, 1, 3);
    const dataBuffer = new Uint8Array([40, 50, 60]).buffer;

    socket.dispatchVideoData({ type: 'configuration', data: configBytes });
    socket.dispatchVideoData({
      type: 'data',
      data: dataBuffer,
      keyFrame: true,
    });
    socket.dispatchDisconnect();

    const packets = await collected;

    expect(packets).toHaveLength(2);
    expect(packets[0].type).toBe('configuration');
    expect(Array.from(packets[0].data)).toEqual([10, 20, 30]);
    expect(packets[1].type).toBe('data');
    expect(Array.from(packets[1].data)).toEqual([40, 50, 60]);
  });

  test('does not populate pts (no device timestamp available from socket)', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket);
    const collected = collectStream(stream);

    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([0]),
    });
    socket.dispatchVideoData({ type: 'data', data: new Uint8Array([1]) });
    socket.dispatchDisconnect();

    const packets = await collected;
    const dataPackets = packets.filter(
      (packet): packet is Extract<ScrcpyMediaStreamPacket, { type: 'data' }> =>
        packet.type === 'data',
    );

    expect(dataPackets).toHaveLength(1);
    expect(dataPackets[0].pts).toBeUndefined();
  });

  test('drops non-keyframe data packets when consumer stalls past bufferLimit', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket, { bufferLimit: 2 });

    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([0]),
    });
    // Slam more frames into the queue than the buffer can hold. Without
    // backpressure the queue would grow to `frameCount`; with the fix only
    // keyframes survive the overflow window.
    const frameCount = 50;
    const dataByte = (idx: number) => idx & 0xff;
    for (let i = 0; i < frameCount; i++) {
      socket.dispatchVideoData({
        type: 'data',
        data: new Uint8Array([dataByte(i)]),
        keyFrame: i === 0 || i === 25,
      });
    }
    socket.dispatchDisconnect();

    const packets = await collectStream(stream);
    const dataPackets = packets.filter(
      (packet): packet is Extract<ScrcpyMediaStreamPacket, { type: 'data' }> =>
        packet.type === 'data',
    );

    // Keyframes must survive so the decoder can resync after the drop.
    const keyframeBytes = dataPackets
      .filter((p) => p.keyframe === true)
      .map((p) => p.data[0]);
    expect(keyframeBytes).toEqual([dataByte(0), dataByte(25)]);

    // Total delivered packets must be bounded, not proportional to input.
    expect(dataPackets.length).toBeLessThan(frameCount);
  });

  test('bounds the pre-configuration buffer and preserves keyframes', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket, { bufferLimit: 3 });
    const collected = collectStream(stream);

    // Send many data packets BEFORE configuration. Only one is a keyframe,
    // and the buffer must keep at least that one once configuration drains.
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([1]),
      keyFrame: false,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([2]),
      keyFrame: true,
    });
    for (let i = 3; i < 30; i++) {
      socket.dispatchVideoData({
        type: 'data',
        data: new Uint8Array([i]),
        keyFrame: false,
      });
    }
    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([99]),
    });
    socket.dispatchDisconnect();

    const packets = await collected;
    const dataPackets = packets.filter(
      (packet): packet is Extract<ScrcpyMediaStreamPacket, { type: 'data' }> =>
        packet.type === 'data',
    );
    const keyframeBytes = dataPackets
      .filter((p) => p.keyframe === true)
      .map((p) => p.data[0]);
    expect(keyframeBytes).toEqual([2]);
    expect(dataPackets.length).toBeLessThanOrEqual(3);
  });
});
