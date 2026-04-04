import { describe, expect, test } from 'vitest';
import {
  type ScrcpyVideoPacket,
  createScrcpyVideoStream,
} from '../src/scrcpy-stream';

type VideoDataHandler = (data: {
  type?: string;
  data: ArrayLike<number>;
  timestamp: number;
}) => void;
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

  dispatchVideoData(packet: {
    type?: string;
    data: ArrayLike<number>;
    timestamp: number;
  }) {
    this.videoDataHandlers.forEach((handler) => handler(packet));
  }

  dispatchDisconnect() {
    this.disconnectHandlers.forEach((handler) => handler());
  }
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
    const packets: ScrcpyVideoPacket[] = [];

    const pipePromise = stream.pipeTo(
      new WritableStream<ScrcpyVideoPacket>({
        write(packet) {
          packets.push(packet);
        },
      }),
    );

    socket.dispatchVideoData({
      type: 'data',
      data: [1, 2, 3],
      timestamp: 1,
    });
    socket.dispatchVideoData({
      type: 'configuration',
      data: [9],
      timestamp: 2,
    });
    socket.dispatchVideoData({
      type: 'data',
      data: [4, 5, 6],
      timestamp: 3,
    });
    socket.dispatchDisconnect();

    await pipePromise;

    expect(
      packets.map((packet) => ({
        type: packet.type,
        data: Array.from(packet.data),
        timestamp: packet.timestamp,
      })),
    ).toEqual([
      {
        type: 'configuration',
        data: [9],
        timestamp: 2,
      },
      {
        type: 'data',
        data: [1, 2, 3],
        timestamp: 1,
      },
      {
        type: 'data',
        data: [4, 5, 6],
        timestamp: 3,
      },
    ]);
  });
});
