import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import {
  SCRCPY_VIDEO_MAX_PACKET_AGE_MS,
  type ScrcpyVideoStreamPacket,
} from './scrcpy-stream';

export const SCRCPY_VIDEO_MAX_DECODER_BACKLOG = 3;

export interface ScrcpyVideoDecoderLike {
  readonly framesRendered: number;
  readonly framesSkipped: number;
  readonly writable: WritableStream<ScrcpyMediaStreamPacket>;
}

export type ScrcpyDecoderAdmissionDecision =
  | 'drop'
  | 'submit'
  | 'wait-for-capacity';

export class ScrcpyDecoderAdmissionPolicy {
  private lastSequence: number | undefined;
  private waitingForKeyframe = false;

  constructor(private readonly maxPacketAgeMs: number) {}

  decide(
    packet: ScrcpyVideoStreamPacket,
    options: { decoderOverloaded: boolean; now: number },
  ): ScrcpyDecoderAdmissionDecision {
    if (packet.media.type === 'configuration') {
      if (packet.transport) {
        this.lastSequence = packet.transport.sequence;
      }
      return 'submit';
    }

    const stale = options.now - packet.receivedAt > this.maxPacketAgeMs;
    if (packet.transport) {
      const sequenceDiscontinuity =
        this.lastSequence !== undefined &&
        packet.transport.sequence !== this.lastSequence + 1;
      this.lastSequence = packet.transport.sequence;
      if (sequenceDiscontinuity || stale) {
        this.waitingForKeyframe = true;
      }
    } else if (stale) {
      this.waitingForKeyframe = true;
    }

    if (this.waitingForKeyframe && (!packet.media.keyframe || stale)) {
      return 'drop';
    }

    if (options.decoderOverloaded) {
      this.waitingForKeyframe = true;
      return packet.media.keyframe && !stale ? 'wait-for-capacity' : 'drop';
    }

    if (stale) {
      this.waitingForKeyframe = true;
      return 'drop';
    }

    this.waitingForKeyframe = false;
    return 'submit';
  }

  resumeRetainedKeyframe(packet: ScrcpyVideoStreamPacket, now: number) {
    if (
      packet.media.type !== 'data' ||
      !packet.media.keyframe ||
      now - packet.receivedAt > this.maxPacketAgeMs
    ) {
      this.waitingForKeyframe = true;
      return false;
    }
    this.waitingForKeyframe = false;
    return true;
  }
}

export interface BoundedScrcpyDecoderOptions {
  maxDecoderBacklog?: number;
  maxPacketAgeMs?: number;
  now?: () => number;
  waitForDecoderProgress?: () => Promise<void>;
}

function waitForDecoderTick() {
  return new Promise<void>((resolve) => setTimeout(resolve, 16));
}

export function createBoundedScrcpyDecoderWritable(
  decoder: ScrcpyVideoDecoderLike,
  options: BoundedScrcpyDecoderOptions = {},
): WritableStream<ScrcpyVideoStreamPacket> {
  const maxDecoderBacklog =
    options.maxDecoderBacklog ?? SCRCPY_VIDEO_MAX_DECODER_BACKLOG;
  if (!Number.isSafeInteger(maxDecoderBacklog) || maxDecoderBacklog < 1) {
    throw new Error('maxDecoderBacklog must be a positive integer.');
  }
  const maxPacketAgeMs =
    options.maxPacketAgeMs ?? SCRCPY_VIDEO_MAX_PACKET_AGE_MS;
  const now = options.now ?? Date.now;
  const waitForDecoderProgress =
    options.waitForDecoderProgress ?? waitForDecoderTick;
  const policy = new ScrcpyDecoderAdmissionPolicy(maxPacketAgeMs);
  const writer = decoder.writable.getWriter();
  const initialCompletedFrames = decoder.framesRendered + decoder.framesSkipped;
  let submittedFrames = 0;

  const getDecoderBacklog = () => {
    const completedFrames = Math.max(
      0,
      decoder.framesRendered + decoder.framesSkipped - initialCompletedFrames,
    );
    return Math.max(0, submittedFrames - completedFrames);
  };

  return new WritableStream<ScrcpyVideoStreamPacket>({
    async write(packet) {
      const decision = policy.decide(packet, {
        decoderOverloaded: getDecoderBacklog() >= maxDecoderBacklog,
        now: now(),
      });
      if (decision === 'drop') {
        return;
      }
      if (decision === 'wait-for-capacity') {
        while (getDecoderBacklog() >= maxDecoderBacklog) {
          await waitForDecoderProgress();
          if (now() - packet.receivedAt > maxPacketAgeMs) {
            policy.resumeRetainedKeyframe(packet, now());
            return;
          }
        }
        if (!policy.resumeRetainedKeyframe(packet, now())) {
          return;
        }
      }

      await writer.write(packet.media);
      if (packet.media.type === 'data') {
        submittedFrames += 1;
      }
    },
    close: () => writer.close(),
    abort: (reason) => writer.abort(reason),
  });
}
