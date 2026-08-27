import { describe, expect, rs, test } from '@rstest/core';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import {
  type ScrcpyVideoStreamPacket,
  createScrcpyVideoStream,
} from '../src/scrcpy-stream';

interface RawVideoPayload {
  type?: string;
  data: ArrayBuffer | ArrayBufferView;
  keyFrame?: boolean;
  sequence?: number;
  receivedAt?: number;
  sentAt?: number;
  timestamp?: number;
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
    const normalizedPacket =
      Number.isSafeInteger(packet.sequence) &&
      typeof packet.receivedAt === 'number'
        ? {
            ...packet,
            sentAt: packet.sentAt ?? packet.receivedAt,
            timestamp: packet.timestamp ?? packet.sentAt ?? packet.receivedAt,
          }
        : packet;
    this.videoDataHandlers.forEach((handler) => handler(normalizedPacket));
  }

  dispatchDisconnect() {
    this.disconnectHandlers.forEach((handler) => handler());
  }
}

async function collectStream(
  stream: ReadableStream<ScrcpyVideoStreamPacket>,
): Promise<ScrcpyMediaStreamPacket[]> {
  const packets: ScrcpyMediaStreamPacket[] = [];
  await stream.pipeTo(
    new WritableStream<ScrcpyVideoStreamPacket>({
      write(packet) {
        packets.push(packet.media);
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

  test('reports first usable data only after configuration is available', async () => {
    const socket = new MockScrcpySocket();
    const onFirstDataPacket = rs.fn();
    const stream = createScrcpyVideoStream(socket, { onFirstDataPacket });
    const collected = collectStream(stream);

    socket.dispatchVideoData({ type: 'data', data: new Uint8Array([1]) });
    expect(onFirstDataPacket).not.toHaveBeenCalled();
    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([9]),
    });
    socket.dispatchVideoData({ type: 'data', data: new Uint8Array([2]) });
    socket.dispatchDisconnect();
    await collected;

    expect(onFirstDataPacket).toHaveBeenCalledTimes(1);
  });

  test('bounds the pre-configuration buffer while the decoder initializes', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket);
    const collected = collectStream(stream);

    for (let index = 0; index < 10; index += 1) {
      socket.dispatchVideoData({
        type: 'data',
        data: new Uint8Array([index]),
      });
    }
    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([9]),
    });
    socket.dispatchDisconnect();

    const packets = await collected;
    expect(packets).toHaveLength(3);
    expect(packets[0].type).toBe('configuration');
    expect(
      packets
        .filter((packet) => packet.type === 'data')
        .map((packet) => packet.data[0]),
    ).toEqual([0, 1]);
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

  test('keeps freshness metadata attached until decoder admission', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket, { now: () => 1_050 });
    const reader = stream.getReader();

    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([0]),
      sequence: 6,
      receivedAt: 1_000,
      sentAt: 1_025,
      timestamp: 1_025,
    });

    const packet = (await reader.read()).value;
    expect(packet?.media.type).toBe('configuration');
    expect(packet?.receivedAt).toBe(1_000);
    expect(packet?.transport).toEqual({
      sequence: 6,
      receivedAt: 1_000,
      sentAt: 1_025,
      timestamp: 1_025,
    });

    socket.dispatchDisconnect();
    expect((await reader.read()).done).toBe(true);
  });

  test('drops stale packets until a fresh keyframe arrives', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket, { now: () => 1_000 });
    const collected = collectStream(stream);

    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([0]),
      sequence: 0,
      receivedAt: 900,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([1]),
      keyFrame: false,
      sequence: 1,
      receivedAt: 400,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([2]),
      keyFrame: false,
      sequence: 2,
      receivedAt: 900,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([3]),
      keyFrame: true,
      sequence: 3,
      receivedAt: 900,
    });
    socket.dispatchDisconnect();

    const packets = await collected;
    expect(packets.map((packet) => packet.data[0])).toEqual([0, 3]);
  });

  test('waits for a keyframe after a sequence discontinuity', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket, { now: () => 1_000 });
    const collected = collectStream(stream);

    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([0]),
      sequence: 0,
      receivedAt: 900,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([1]),
      keyFrame: true,
      sequence: 1,
      receivedAt: 900,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([3]),
      keyFrame: false,
      sequence: 3,
      receivedAt: 900,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([4]),
      keyFrame: false,
      sequence: 4,
      receivedAt: 900,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([5]),
      keyFrame: true,
      sequence: 5,
      receivedAt: 900,
    });
    socket.dispatchDisconnect();

    const packets = await collected;
    expect(packets.map((packet) => packet.data[0])).toEqual([0, 1, 5]);
  });

  test('keeps legacy packets without freshness metadata compatible', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket, { now: () => 1_000 });
    const collected = collectStream(stream);

    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([0]),
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([1]),
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([2]),
    });
    socket.dispatchDisconnect();

    const packets = await collected;
    expect(packets.map((packet) => packet.data[0])).toEqual([0, 1, 2]);
  });

  test('does not resume from a delta frame after local queue overload', async () => {
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket, { now: () => 1_000 });
    const reader = stream.getReader();

    const dispatch = (sequence: number, keyFrame: boolean) => {
      socket.dispatchVideoData({
        type: 'data',
        data: new Uint8Array([sequence]),
        keyFrame,
        sequence,
        receivedAt: 900,
      });
    };
    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([0]),
      sequence: 0,
      receivedAt: 900,
    });
    dispatch(1, true);
    dispatch(2, false);
    dispatch(3, false);
    dispatch(4, false);

    expect((await reader.read()).value?.media.data[0]).toBe(0);
    expect((await reader.read()).value?.media.data[0]).toBe(1);
    expect((await reader.read()).value?.media.data[0]).toBe(2);
    expect((await reader.read()).value?.media.data[0]).toBe(3);

    dispatch(5, false);
    dispatch(6, true);
    socket.dispatchDisconnect();

    expect((await reader.read()).value?.media.data[0]).toBe(6);
    expect((await reader.read()).done).toBe(true);
  });

  test('also requires a keyframe after legacy queue overload', async () => {
    const socket = new MockScrcpySocket();
    const reader = createScrcpyVideoStream(socket).getReader();
    const dispatch = (value: number, keyFrame = false) => {
      socket.dispatchVideoData({
        type: 'data',
        data: new Uint8Array([value]),
        keyFrame,
      });
    };

    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([0]),
    });
    dispatch(1, true);
    dispatch(2);
    dispatch(3);
    dispatch(4);

    expect((await reader.read()).value?.media.data[0]).toBe(0);
    expect((await reader.read()).value?.media.data[0]).toBe(1);
    expect((await reader.read()).value?.media.data[0]).toBe(2);
    expect((await reader.read()).value?.media.data[0]).toBe(3);

    dispatch(5);
    dispatch(6, true);
    socket.dispatchDisconnect();

    expect((await reader.read()).value?.media.data[0]).toBe(6);
    expect((await reader.read()).done).toBe(true);
  });

  test('discards a retained keyframe if it ages before the decoder pulls', async () => {
    let currentTime = 1_000;
    const socket = new MockScrcpySocket();
    const stream = createScrcpyVideoStream(socket, {
      now: () => currentTime,
    });
    socket.dispatchVideoData({
      type: 'configuration',
      data: new Uint8Array([0]),
      sequence: 0,
      receivedAt: currentTime,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([1]),
      keyFrame: true,
      sequence: 1,
      receivedAt: currentTime,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([2]),
      keyFrame: true,
      sequence: 2,
      receivedAt: currentTime,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([3]),
      keyFrame: true,
      sequence: 3,
      receivedAt: currentTime,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([4]),
      keyFrame: true,
      sequence: 4,
      receivedAt: currentTime,
    });
    currentTime = 1_600;
    const reader = stream.getReader();
    expect((await reader.read()).value?.media.data[0]).toBe(0);
    expect((await reader.read()).value?.media.data[0]).toBe(1);
    expect((await reader.read()).value?.media.data[0]).toBe(2);
    expect((await reader.read()).value?.media.data[0]).toBe(3);
    const nextPacket = reader.read();
    await Promise.resolve();
    socket.dispatchVideoData({
      type: 'data',
      data: new Uint8Array([5]),
      keyFrame: true,
      sequence: 5,
      receivedAt: currentTime,
    });
    expect((await nextPacket).value?.media.data[0]).toBe(5);

    socket.dispatchDisconnect();
    expect((await reader.read()).done).toBe(true);
  });
});
