import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';

type RawScrcpyVideoData = ArrayBuffer | ArrayBufferView;

interface RawScrcpyVideoPacket {
  type?: string;
  data: RawScrcpyVideoData;
  keyFrame?: boolean;
}

function toUint8Array(data: RawScrcpyVideoData): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

interface ScrcpyVideoSocketLike {
  on(event: 'video-data', handler: (data: RawScrcpyVideoPacket) => void): void;
  on(event: 'disconnect', handler: () => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  off(event: 'video-data', handler: (data: RawScrcpyVideoPacket) => void): void;
  off(event: 'disconnect', handler: () => void): void;
  off(event: 'error', handler: (error: Error) => void): void;
}

interface ScrcpyVideoStreamOptions {
  onFirstDataPacket?: () => void;
}

type DecoderState =
  | 'waiting-for-configuration'
  | 'waiting-for-keyframe'
  | 'ready';

export function createScrcpyVideoStream(
  socket: ScrcpyVideoSocketLike,
  options: ScrcpyVideoStreamOptions = {},
): ReadableStream<ScrcpyMediaStreamPacket> {
  let decoderState: DecoderState = 'waiting-for-configuration';
  let firstDataPacketReported = false;
  let pendingDataPackets: ScrcpyMediaStreamPacket[] = [];
  let cleanupListeners: (() => void) | undefined;
  let pendingKeyframe: ScrcpyMediaStreamPacket | undefined;
  const reportFirstDataPacket = () => {
    if (!firstDataPacketReported) {
      firstDataPacketReported = true;
      options.onFirstDataPacket?.();
    }
  };
  const readable = new ReadableStream<ScrcpyMediaStreamPacket>(
    {
      start(controller) {
        const canEnqueue = () =>
          controller.desiredSize === null || controller.desiredSize > 0;
        const handleVideoData = (data: RawScrcpyVideoPacket) => {
          try {
            if (
              data.type !== 'configuration' &&
              typeof data.keyFrame !== 'boolean'
            ) {
              throw new Error(
                'Scrcpy video data packet is missing keyFrame metadata',
              );
            }
            const payload = toUint8Array(data.data);
            const packet: ScrcpyMediaStreamPacket =
              data.type === 'configuration'
                ? {
                    type: 'configuration',
                    data: payload,
                  }
                : {
                    type: 'data',
                    data: payload,
                    keyframe: data.keyFrame,
                  };
            if (packet.type === 'configuration') {
              decoderState = 'waiting-for-keyframe';
              pendingKeyframe = undefined;
              // This small, bounded initial burst is required by WebCodecs:
              // it must receive configuration before any retained frame.
              controller.enqueue(packet);
              if (pendingDataPackets.length > 0) {
                decoderState = 'ready';
                reportFirstDataPacket();
                pendingDataPackets.forEach((queuedPacket) =>
                  controller.enqueue(queuedPacket),
                );
              }
              pendingDataPackets = [];
              return;
            }

            if (decoderState === 'waiting-for-configuration') {
              // Socket.IO cannot apply Web Streams backpressure to scrcpy.
              // Retain only a keyframe and one following delta while the
              // renderer initializes its decoder. Deltas before a keyframe
              // can never be decoded and are discarded.
              if (packet.keyframe) {
                pendingDataPackets = [packet];
              } else if (
                pendingDataPackets.length > 0 &&
                pendingDataPackets.length < 2
              ) {
                pendingDataPackets.push(packet);
              }
              return;
            }

            if (decoderState === 'waiting-for-keyframe') {
              // Drop the rest of the damaged GOP. Resume only after a
              // keyframe has actually entered the bounded stream queue.
              if (!packet.keyframe) {
                return;
              }
              if (canEnqueue()) {
                decoderState = 'ready';
                reportFirstDataPacket();
                controller.enqueue(packet);
              } else {
                pendingKeyframe = packet;
              }
              return;
            }

            if (canEnqueue()) {
              reportFirstDataPacket();
              controller.enqueue(packet);
              return;
            }

            // Dropping one predictive frame invalidates all dependent frames
            // in the same GOP. Enter recovery mode instead of forwarding a
            // broken prediction chain to WebCodecs.
            decoderState = 'waiting-for-keyframe';
            pendingKeyframe = packet.keyframe ? packet : undefined;
          } catch (error) {
            cleanupListeners?.();
            controller.error(error);
          }
        };

        const handleDisconnect = () => {
          cleanupListeners?.();
          controller.close();
        };
        const handleError = (error: Error) => {
          cleanupListeners?.();
          controller.error(error);
        };

        cleanupListeners = () => {
          socket.off('video-data', handleVideoData);
          socket.off('disconnect', handleDisconnect);
          socket.off('error', handleError);
        };

        socket.on('video-data', handleVideoData);
        socket.on('disconnect', handleDisconnect);
        socket.on('error', handleError);
      },
      pull(controller) {
        if (
          pendingKeyframe &&
          (controller.desiredSize === null || controller.desiredSize > 0)
        ) {
          reportFirstDataPacket();
          controller.enqueue(pendingKeyframe);
          pendingKeyframe = undefined;
          decoderState = 'ready';
        }
      },
      cancel() {
        cleanupListeners?.();
        pendingKeyframe = undefined;
        pendingDataPackets = [];
        decoderState = 'waiting-for-configuration';
      },
    },
    { highWaterMark: 4 },
  );

  return readable;
}
