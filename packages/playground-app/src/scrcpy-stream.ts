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

export function createScrcpyVideoStream(
  socket: ScrcpyVideoSocketLike,
  options: ScrcpyVideoStreamOptions = {},
): ReadableStream<ScrcpyMediaStreamPacket> {
  let configurationPacketSent = false;
  let firstDataPacketReported = false;
  let pendingDataPackets: ScrcpyMediaStreamPacket[] = [];
  let cleanupListeners: (() => void) | undefined;
  let pendingKeyframe: ScrcpyMediaStreamPacket | undefined;
  const readable = new ReadableStream<ScrcpyMediaStreamPacket>(
    {
      start(controller) {
        const canEnqueue = () =>
          controller.desiredSize === null || controller.desiredSize > 0;
        const reportFirstDataPacket = () => {
          if (!firstDataPacketReported) {
            firstDataPacketReported = true;
            options.onFirstDataPacket?.();
          }
        };
        const handleVideoData = (data: RawScrcpyVideoPacket) => {
          try {
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
              configurationPacketSent = true;
              // This small, bounded initial burst is required by WebCodecs:
              // it must receive configuration before any retained frame.
              controller.enqueue(packet);
              if (pendingDataPackets.length > 0) {
                reportFirstDataPacket();
              }
              pendingDataPackets.forEach((queuedPacket) =>
                controller.enqueue(queuedPacket),
              );
              pendingDataPackets = [];
              return;
            }

            if (!configurationPacketSent) {
              // Socket.IO cannot apply Web Streams backpressure to scrcpy.
              // Keep a tiny pre-configuration buffer instead of retaining
              // every frame while the renderer initializes its decoder.
              if (packet.keyframe) {
                pendingDataPackets = [packet];
              } else if (pendingDataPackets.length < 2) {
                pendingDataPackets.push(packet);
              }
              return;
            }

            if (canEnqueue()) {
              reportFirstDataPacket();
              controller.enqueue(packet);
            } else if (packet.keyframe) {
              // Discard delta frames while the decoder is behind. The newest
              // keyframe lets it resume without accumulating stale frames.
              pendingKeyframe = packet;
            }
          } catch (error) {
            controller.error(error);
          }
        };

        const handleDisconnect = () => controller.close();
        const handleError = (error: Error) => controller.error(error);

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
        if (controller.desiredSize === null || controller.desiredSize > 0) {
          if (
            pendingKeyframe &&
            (controller.desiredSize === null || controller.desiredSize > 0)
          ) {
            controller.enqueue(pendingKeyframe);
            pendingKeyframe = undefined;
          }
        }
      },
      cancel() {
        cleanupListeners?.();
        pendingKeyframe = undefined;
        pendingDataPackets = [];
      },
    },
    { highWaterMark: 4 },
  );

  return readable;
}
