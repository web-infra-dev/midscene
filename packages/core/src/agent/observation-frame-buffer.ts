import type { UIObservationFrame } from '@midscene/shared/agent-tools/types';
import type { DeviceFrameRef } from '../device';

export interface BufferedObservationFrame extends DeviceFrameRef {
  /** Present once the image has been persisted. */
  persisted?: UIObservationFrame;
}

type CaptureMode = 'sampled' | 'source';
type AddResult = 'retained' | 'thinned' | 'dropped';

/** Owns the distinct retention contracts for sampled and complete source capture. */
export class ObservationFrameBuffer {
  private retained: BufferedObservationFrame[] = [];
  private dropped = 0;

  constructor(
    private readonly mode: CaptureMode,
    private readonly maxFrames: number,
  ) {}

  get frames(): BufferedObservationFrame[] {
    return this.retained;
  }

  get droppedFrames(): number {
    return this.dropped;
  }

  add(frame: DeviceFrameRef | BufferedObservationFrame): AddResult {
    if (this.mode === 'source' && this.retained.length >= this.maxFrames) {
      this.dropped++;
      return 'dropped';
    }
    this.retained.push({
      ...frame,
      ...(frame.timing ? { timing: { ...frame.timing } } : {}),
    });
    if (this.retained.length <= this.maxFrames) return 'retained';

    const before = this.retained.length;
    this.retained = thinSampledFrames(this.retained, this.maxFrames);
    this.dropped += before - this.retained.length;
    return 'thinned';
  }

  clear(): void {
    this.retained = [];
  }
}

function thinSampledFrames<T extends { ref: unknown }>(
  frames: T[],
  maxFrames: number,
): T[] {
  if (frames.length <= 1) return frames;
  const isChangePoint = new Array(frames.length).fill(false);
  isChangePoint[0] = true;
  for (let index = 1; index < frames.length; index++) {
    if (frames[index].ref !== frames[index - 1].ref) {
      isChangePoint[index] = true;
    }
  }
  isChangePoint[frames.length - 1] = true;

  let result: T[] = [];
  let staticCounter = 0;
  for (let index = 0; index < frames.length; index++) {
    if (isChangePoint[index]) {
      result.push(frames[index]);
      staticCounter = 0;
    } else if (staticCounter % 2 === 0) {
      result.push(frames[index]);
      staticCounter++;
    } else {
      staticCounter++;
    }
  }

  if (result.length > maxFrames) {
    const step = result.length / maxFrames;
    const sampled: T[] = [];
    for (let index = 0; index < maxFrames; index++) {
      sampled.push(result[Math.floor(index * step)]);
    }
    sampled[maxFrames - 1] = result[result.length - 1];
    result = sampled;
  }
  return result;
}
