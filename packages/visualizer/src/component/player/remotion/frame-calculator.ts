import type { AnimationScript } from '../../../utils/replay-scripts';

export const FPS = 30;
export const OPENING_FRAMES = 90; // 3 seconds
export const ENDING_FRAMES = 90; // 3 seconds

export interface CameraKeyframe {
  img: string;
  cameraLeft: number;
  cameraTop: number;
  cameraWidth: number;
  pointerLeft: number;
  pointerTop: number;
  // Frame offset within the segment (0-based)
  startFrame: number;
  durationInFrames: number;
}

export interface StepSegment {
  stepIndex: number;
  startFrame: number;
  durationInFrames: number;
  title: string;
  imageWidth: number;
  imageHeight: number;
  keyframes: CameraKeyframe[];
}

export interface FrameMap {
  segments: StepSegment[];
  totalDurationInFrames: number;
  fps: number;
  openingDurationInFrames: number;
  endingDurationInFrames: number;
  stepsDurationInFrames: number;
}

interface VisualKeyframe {
  img: string;
  imageWidth: number;
  imageHeight: number;
  cameraLeft: number;
  cameraTop: number;
  cameraWidth: number;
  pointerLeft: number;
  pointerTop: number;
  title: string;
  durationMs: number;
  taskId?: string;
}

export function calculateFrameMap(scripts: AnimationScript[]): FrameMap {
  const keyframes: VisualKeyframe[] = [];
  let lastPointerX = 0;
  let lastPointerY = 0;
  let lastImageWidth = 1920;
  let lastImageHeight = 1080;

  // Initialize defaults from first img/insight script
  for (const s of scripts) {
    if ((s.type === 'img' || s.type === 'insight') && s.img) {
      lastImageWidth = s.imageWidth || 1920;
      lastImageHeight = s.imageHeight || 1080;
      lastPointerX = Math.round(lastImageWidth / 2);
      lastPointerY = Math.round(lastImageHeight / 2);
      break;
    }
  }

  for (const script of scripts) {
    if (script.type !== 'img' && script.type !== 'insight') continue;
    if (!script.img) continue;

    const iw = script.imageWidth || lastImageWidth;
    const ih = script.imageHeight || lastImageHeight;
    const camera = script.camera;
    const cameraLeft = camera?.left ?? 0;
    const cameraTop = camera?.top ?? 0;
    const cameraWidth = camera?.width ?? iw;
    const pointerLeft = camera?.pointerLeft ?? lastPointerX;
    const pointerTop = camera?.pointerTop ?? lastPointerY;

    const durationMs = script.duration + (script.insightCameraDuration || 0);

    keyframes.push({
      img: script.img,
      imageWidth: iw,
      imageHeight: ih,
      cameraLeft,
      cameraTop,
      cameraWidth,
      pointerLeft,
      pointerTop,
      title: script.title || script.subTitle || '',
      durationMs: Math.max(durationMs, 500),
      taskId: script.taskId,
    });

    lastImageWidth = iw;
    lastImageHeight = ih;
    lastPointerX = pointerLeft;
    lastPointerY = pointerTop;
  }

  // Group keyframes into segments by taskId
  const segmentMap = new Map<string, VisualKeyframe[]>();
  const segmentOrder: string[] = [];

  for (const kf of keyframes) {
    const key = kf.taskId || `__anon_${segmentOrder.length}`;
    if (!segmentMap.has(key)) {
      segmentMap.set(key, []);
      segmentOrder.push(key);
    }
    segmentMap.get(key)!.push(kf);
  }

  // Build segments with frame offsets
  const segments: StepSegment[] = [];
  let currentFrame = OPENING_FRAMES;

  for (let i = 0; i < segmentOrder.length; i++) {
    const key = segmentOrder[i];
    const kfs = segmentMap.get(key)!;

    const totalMs = kfs.reduce((sum, kf) => sum + kf.durationMs, 0);
    const totalFrames = Math.max(Math.ceil((totalMs / 1000) * FPS), 30);

    const cameraKeyframes: CameraKeyframe[] = [];
    let frameOffset = 0;

    for (let j = 0; j < kfs.length; j++) {
      const kf = kfs[j];
      const kfFrames =
        j === kfs.length - 1
          ? totalFrames - frameOffset
          : Math.max(Math.round((kf.durationMs / totalMs) * totalFrames), 1);

      cameraKeyframes.push({
        img: kf.img,
        cameraLeft: kf.cameraLeft,
        cameraTop: kf.cameraTop,
        cameraWidth: kf.cameraWidth,
        pointerLeft: kf.pointerLeft,
        pointerTop: kf.pointerTop,
        startFrame: frameOffset,
        durationInFrames: kfFrames,
      });

      frameOffset += kfFrames;
    }

    segments.push({
      stepIndex: i,
      startFrame: currentFrame,
      durationInFrames: totalFrames,
      title: kfs[0].title,
      imageWidth: kfs[0].imageWidth,
      imageHeight: kfs[0].imageHeight,
      keyframes: cameraKeyframes,
    });

    currentFrame += totalFrames;
  }

  const stepsDurationInFrames = currentFrame - OPENING_FRAMES;

  return {
    segments,
    totalDurationInFrames:
      OPENING_FRAMES + stepsDurationInFrames + ENDING_FRAMES,
    fps: FPS,
    openingDurationInFrames: OPENING_FRAMES,
    endingDurationInFrames: ENDING_FRAMES,
    stepsDurationInFrames,
  };
}
