import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { describe, expect, test } from 'vitest';
import { createScrcpyVideoStream } from '../src/scrcpy-stream';

interface RawVideoPayload {
  type?: string;
  data: ArrayLike<number>;
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

    socket.dispatchVideoData({ type: 'data', data: [1, 2, 3] });
    socket.dispatchVideoData({ type: 'configuration', data: [9] });
    socket.dispatchVideoData({ type: 'data', data: [4, 5, 6] });
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

    socket.dispatchVideoData({ type: 'configuration', data: [0] });
    socket.dispatchVideoData({ type: 'data', data: [1], keyFrame: true });
    socket.dispatchVideoData({ type: 'data', data: [2], keyFrame: false });
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

  test('does not populate pts (no device timestamp available from socket)', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket);
    const collected = collectStream(stream);

    socket.dispatchVideoData({ type: 'configuration', data: [0] });
    socket.dispatchVideoData({ type: 'data', data: [1] });
    socket.dispatchDisconnect();

    const packets = await collected;
    const dataPackets = packets.filter(
      (packet): packet is Extract<ScrcpyMediaStreamPacket, { type: 'data' }> =>
        packet.type === 'data',
    );

    expect(dataPackets).toHaveLength(1);
    expect(dataPackets[0].pts).toBeUndefined();
  });
});
