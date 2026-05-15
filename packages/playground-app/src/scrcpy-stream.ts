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

export interface CreateScrcpyVideoStreamOptions {
  /**
   * Hard cap on packets buffered between the socket and the decoder before we
   * start dropping non-keyframe `data` packets. The socket is push-only — if
   * the WebCodecs decoder briefly stalls (GC pause, low-memory machine), the
   * ReadableStream's internal queue can otherwise grow without bound and the
   * renderer process is killed with `Crashpad_NotConnectedToHandle` on
   * memory-constrained machines (reported on 8 GB Windows).
   *
   * `configuration` packets and keyframes are always preserved so the decoder
   * can recover after a drop — losing them would freeze the picture instead
   * of just dropping a frame.
   */
  bufferLimit?: number;
}

const DEFAULT_BUFFER_LIMIT = 60;

export function createScrcpyVideoStream(
  socket: ScrcpyVideoSocketLike,
  options: CreateScrcpyVideoStreamOptions = {},
): ReadableStream<ScrcpyMediaStreamPacket> {
  const bufferLimit = Math.max(1, options.bufferLimit ?? DEFAULT_BUFFER_LIMIT);

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
        // Bound the pre-configuration buffer the same way as the live queue.
        // If configuration never arrives we still don't want to leak packets,
        // and once it does the decoder only needs the last keyframe onwards.
        if (pendingDataPackets.length >= bufferLimit) {
          const firstNonKeyframeIdx = pendingDataPackets.findIndex(
            (packet) => packet.type === 'data' && !packet.keyframe,
          );
          if (firstNonKeyframeIdx !== -1) {
            pendingDataPackets.splice(firstNonKeyframeIdx, 1);
          } else {
            pendingDataPackets.shift();
          }
        }
        pendingDataPackets.push(chunk);
        return;
      }

      controller.enqueue(chunk);
    },
  });

  let cleanupListeners: (() => void) | undefined;
  const readable = new ReadableStream<ScrcpyMediaStreamPacket>(
    {
      start(controller) {
        const handleVideoData = (data: RawScrcpyVideoPacket) => {
          try {
            const payload = toUint8Array(data.data);
            if (data.type === 'configuration') {
              controller.enqueue({
                type: 'configuration',
                data: payload,
              });
              return;
            }

            // Apply backpressure manually — ReadableStream's default
            // controller is push-only and `enqueue` does not block when the
            // queue is past its high water mark, it just lets `desiredSize`
            // go negative. We mirror that signal here and drop non-essential
            // frames so heap stays bounded under decoder stalls.
            const desiredSize = controller.desiredSize ?? 1;
            const isKeyframe = data.keyFrame === true;
            if (desiredSize <= 0 && !isKeyframe) {
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
    },
    { highWaterMark: bufferLimit },
  );

  return readable.pipeThrough(transformStream);
}
