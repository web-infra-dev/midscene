export interface ScrcpyVideoPacket {
  type: string;
  data: Uint8Array;
  timestamp: number;
}

interface RawScrcpyVideoPacket {
  type?: string;
  data: ArrayLike<number>;
  timestamp: number;
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
): ReadableStream<ScrcpyVideoPacket> {
  let configurationPacketSent = false;
  let pendingDataPackets: ScrcpyVideoPacket[] = [];

  const transformStream = new TransformStream<
    ScrcpyVideoPacket,
    ScrcpyVideoPacket
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
  const readable = new ReadableStream<ScrcpyVideoPacket>({
    start(controller) {
      const handleVideoData = (data: RawScrcpyVideoPacket) => {
        try {
          controller.enqueue({
            type: data.type || 'data',
            data: new Uint8Array(data.data),
            timestamp: data.timestamp,
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
