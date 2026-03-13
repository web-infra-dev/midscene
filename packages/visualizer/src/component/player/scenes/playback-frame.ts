import { type FrameState, deriveFrameState } from './derive-frame-state';
import type { FrameMap } from './frame-calculator';

export function getPlaybackFrameState(
  frameMap: FrameMap,
  frame: number,
): FrameState | null {
  const state = deriveFrameState(
    frameMap.scriptFrames,
    frame,
    frameMap.imageWidth,
    frameMap.imageHeight,
    frameMap.fps,
  );

  return state.img ? state : null;
}
