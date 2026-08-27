import {
  type IncomingScrcpyVideoTransportPacket,
  type ScrcpyVideoTransportData,
  type ScrcpyVideoTransportMetadata,
  hasScrcpyVideoTransportMetadata,
} from '@midscene/shared/scrcpy-video';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';

function toUint8Array(data: ScrcpyVideoTransportData): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export interface ScrcpyVideoStreamPacket {
  media: ScrcpyMediaStreamPacket;
  receivedAt: number;
  transport?: ScrcpyVideoTransportMetadata;
}

type IncomingScrcpyVideoPacket = IncomingScrcpyVideoTransportPacket;

interface ScrcpyVideoSocketLike {
  on(
    event: 'video-data',
    handler: (data: IncomingScrcpyVideoPacket) => void,
  ): void;
  on(event: 'disconnect', handler: () => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  off(
    event: 'video-data',
    handler: (data: IncomingScrcpyVideoPacket) => void,
  ): void;
  off(event: 'disconnect', handler: () => void): void;
  off(event: 'error', handler: (error: Error) => void): void;
}

interface ScrcpyVideoStreamOptions {
  maxPacketAgeMs?: number;
  now?: () => number;
  onFirstDataPacket?: () => void;
}

export const SCRCPY_VIDEO_MAX_PACKET_AGE_MS = 500;

export function createScrcpyVideoStream(
  socket: ScrcpyVideoSocketLike,
  options: ScrcpyVideoStreamOptions = {},
): ReadableStream<ScrcpyVideoStreamPacket> {
  const maxPacketAgeMs =
    options.maxPacketAgeMs ?? SCRCPY_VIDEO_MAX_PACKET_AGE_MS;
  const now = options.now ?? Date.now;
  let configurationPacketSent = false;
  let firstDataPacketReported = false;
  let pendingDataPackets: ScrcpyVideoStreamPacket[] = [];
  let cleanupListeners: (() => void) | undefined;
  let pendingKeyframe: ScrcpyVideoStreamPacket | undefined;
  let lastSequence: number | undefined;
  let waitingForKeyframe = false;
  const readable = new ReadableStream<ScrcpyVideoStreamPacket>(
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
        const handleVideoData = (data: IncomingScrcpyVideoPacket) => {
          try {
            const payload = toUint8Array(data.data);
            const media: ScrcpyMediaStreamPacket =
              data.type === 'configuration'
                ? {
                    type: 'configuration',
                    data: payload,
                  }
                : {
                    type: 'data',
                    data: payload,
                    keyframe: 'keyFrame' in data ? data.keyFrame : undefined,
                  };
            const transport = hasScrcpyVideoTransportMetadata(data)
              ? {
                  sequence: data.sequence,
                  receivedAt: data.receivedAt,
                  sentAt: data.sentAt,
                  timestamp: data.timestamp,
                }
              : undefined;
            const packet: ScrcpyVideoStreamPacket = {
              media,
              receivedAt: transport?.receivedAt ?? now(),
              ...(transport ? { transport } : {}),
            };
            if (media.type === 'configuration') {
              if (transport) {
                lastSequence = transport.sequence;
              }
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

            if (transport) {
              const sequence = transport.sequence;
              const sequenceDiscontinuity =
                lastSequence !== undefined && sequence !== lastSequence + 1;
              const stale = now() - transport.receivedAt > maxPacketAgeMs;
              lastSequence = sequence;
              if (sequenceDiscontinuity || stale) {
                waitingForKeyframe = true;
              }
              if (waitingForKeyframe) {
                if (media.type !== 'data' || !media.keyframe || stale) {
                  return;
                }
                waitingForKeyframe = false;
              }
            } else if (waitingForKeyframe) {
              // Legacy packets do not carry enough information to prove that
              // a delta frame follows the retained stream. A keyframe is the
              // only safe point to resume after local overload.
              if (media.type !== 'data' || !media.keyframe) {
                return;
              }
              waitingForKeyframe = false;
            }

            if (!configurationPacketSent) {
              // Socket.IO cannot apply Web Streams backpressure to scrcpy.
              // Keep a tiny pre-configuration buffer instead of retaining
              // every frame while the renderer initializes its decoder.
              if (media.type === 'data' && media.keyframe) {
                pendingDataPackets = [packet];
              } else if (pendingDataPackets.length < 2) {
                pendingDataPackets.push(packet);
              }
              return;
            }

            if (canEnqueue()) {
              reportFirstDataPacket();
              controller.enqueue(packet);
            } else if (media.type === 'data' && media.keyframe) {
              // Discard delta frames while the decoder is behind. The newest
              // keyframe lets it resume without accumulating stale frames.
              pendingKeyframe = packet;
              waitingForKeyframe = true;
            } else {
              // Once a compressed delta is discarded, later deltas can no
              // longer be decoded safely. Resume only from a keyframe.
              waitingForKeyframe = true;
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
            const pending = pendingKeyframe;
            pendingKeyframe = undefined;
            if (now() - pending.receivedAt > maxPacketAgeMs) {
              waitingForKeyframe = true;
              return;
            }
            controller.enqueue(pending);
            waitingForKeyframe = false;
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
