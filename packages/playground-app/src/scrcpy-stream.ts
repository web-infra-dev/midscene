import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';

interface RawScrcpyVideoPacket {
  type?: string;
  data: ArrayLike<number>;
  keyFrame?: boolean;
}

interface ScrcpyVideoSocketLike {
  on(event: 'video-data', handler: (data: RawScrcpyVideoPacket) => void): void;
  on(event: 'disconnect', handler: () => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  off(event: 'video-data', handler: (data: RawScrcpyVideoPacket) => void): void;
  off(event: 'disconnect', handler: () => void): void;
  off(event: 'error', handler: (error: Error) => void): void;
}

export function createScrcpyVideoStream(
  socket: ScrcpyVideoSocketLike,
): ReadableStream<ScrcpyMediaStreamPacket> {
  let configurationPacketSent = false;
  let pendingDataPackets: ScrcpyMediaStreamPacket[] = [];

  const transformStream = new TransformStream<
    ScrcpyMediaStreamPacket,
    ScrcpyMediaStreamPacket
  >({
    transform(chunk, controller) {
      if (chunk.type === 'configuration') {
        configurationPacketSent = true;
        controller.enqueue(chunk);
        pendingDataPackets.forEach((queuedPacket) =>
          controller.enqueue(queuedPacket),
        );
        pendingDataPackets = [];
        return;
      }

      if (chunk.type === 'data' && !configurationPacketSent) {
        pendingDataPackets.push(chunk);
        return;
      }

      controller.enqueue(chunk);
    },
  });

  let cleanupListeners: (() => void) | undefined;
  const readable = new ReadableStream<ScrcpyMediaStreamPacket>({
    start(controller) {
      const handleVideoData = (data: RawScrcpyVideoPacket) => {
        try {
          const payload = new Uint8Array(data.data);
          if (data.type === 'configuration') {
            controller.enqueue({
              type: 'configuration',
              data: payload,
            });
            return;
          }

          controller.enqueue({
            type: 'data',
            data: payload,
            keyframe: data.keyFrame,
          });
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
    cancel() {
      cleanupListeners?.();
    },
  });

  return readable.pipeThrough(transformStream);
}
