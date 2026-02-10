import type { LocateResultElement, Rect } from '@midscene/core';
import type { AnimationScript } from '../../../utils/replay-scripts';

export const FPS = 30;
export const OPENING_FRAMES = 90; // 3 seconds
export const ENDING_FRAMES = 90; // 3 seconds

// ── New ScriptFrame-based data structures ──

export interface ScriptFrame {
  type:
    | 'img'
    | 'insight'
    | 'clear-insight'
    | 'pointer'
    | 'spinning-pointer'
    | 'sleep';
  startFrame: number; // steps-local frame offset (0-based)
  durationInFrames: number; // total frames this script occupies

  // screenshot (img/insight)
  img?: string;
  imageWidth?: number;
  imageHeight?: number;

  // camera target (img with camera / insight camera phase)
  cameraTarget?: {
    left: number;
    top: number;
    width: number;
    pointerLeft: number;
    pointerTop: number;
  };

  // insight two-phase: insightPhaseFrames + cameraPhaseFrames = durationInFrames
  insightPhaseFrames?: number;
  cameraPhaseFrames?: number;

  // insight overlay
  highlightElement?: LocateResultElement;
  searchArea?: Rect;

  // pointer type
  pointerImg?: string;

  // metadata
  title?: string;
  subTitle?: string;
  taskId?: string;
}

export interface FrameMapOptions {
  effects: boolean; // include opening/ending
  playbackSpeed: number; // affects duration-to-frames conversion
}

export interface FrameMap {
  scriptFrames: ScriptFrame[];
  totalDurationInFrames: number;
  fps: number; // 30
  openingDurationInFrames: number;
  endingDurationInFrames: number;
  stepsDurationInFrames: number;
  imageWidth: number;
  imageHeight: number;
  deviceType?: string;
}

// ── calculateFrameMap ──

export function calculateFrameMap(
  scripts: AnimationScript[],
  options?: Partial<FrameMapOptions> & { deviceType?: string },
): FrameMap {
  const effects = options?.effects ?? true;
  const openingFrames = effects ? OPENING_FRAMES : 0;
  const endingFrames = effects ? ENDING_FRAMES : 0;

  // Determine base image dimensions from first img/insight script
  let baseImageWidth = 1920;
  let baseImageHeight = 1080;
  for (const s of scripts) {
    if ((s.type === 'img' || s.type === 'insight') && s.img) {
      baseImageWidth = s.imageWidth || 1920;
      baseImageHeight = s.imageHeight || 1080;
      break;
    }
  }

  const scriptFrames: ScriptFrame[] = [];
  let currentFrame = 0;

  for (const script of scripts) {
    const durationMs = script.duration;

    switch (script.type) {
      case 'sleep': {
        const frames = Math.ceil((durationMs / 1000) * FPS);
        scriptFrames.push({
          type: 'sleep',
          startFrame: currentFrame,
          durationInFrames: frames,
          title: script.title,
          subTitle: script.subTitle,
          taskId: script.taskId,
        });
        currentFrame += frames;
        break;
      }

      case 'img': {
        const frames = Math.max(Math.ceil((durationMs / 1000) * FPS), 1);
        const camera = script.camera;
        const iw = script.imageWidth || baseImageWidth;
        const ih = script.imageHeight || baseImageHeight;

        const sf: ScriptFrame = {
          type: 'img',
          startFrame: currentFrame,
          durationInFrames: frames,
          img: script.img,
          imageWidth: iw,
          imageHeight: ih,
          title: script.title,
          subTitle: script.subTitle,
          taskId: script.taskId,
        };

        if (camera) {
          sf.cameraTarget = {
            left: camera.left,
            top: camera.top,
            width: camera.width,
            pointerLeft: camera.pointerLeft ?? Math.round(iw / 2),
            pointerTop: camera.pointerTop ?? Math.round(ih / 2),
          };
        }

        scriptFrames.push(sf);
        currentFrame += frames;
        break;
      }

      case 'insight': {
        const insightPhaseFrames = Math.max(
          Math.ceil((durationMs / 1000) * FPS),
          1,
        );
        const cameraDurationMs = script.insightCameraDuration || 0;
        const cameraPhaseFrames = Math.ceil((cameraDurationMs / 1000) * FPS);
        const totalFrames = insightPhaseFrames + cameraPhaseFrames;
        const iw = script.imageWidth || baseImageWidth;
        const ih = script.imageHeight || baseImageHeight;
        const camera = script.camera;

        const sf: ScriptFrame = {
          type: 'insight',
          startFrame: currentFrame,
          durationInFrames: totalFrames,
          img: script.img,
          imageWidth: iw,
          imageHeight: ih,
          insightPhaseFrames,
          cameraPhaseFrames,
          highlightElement: script.highlightElement,
          searchArea: script.searchArea,
          title: script.title,
          subTitle: script.subTitle,
          taskId: script.taskId,
        };

        if (camera) {
          sf.cameraTarget = {
            left: camera.left,
            top: camera.top,
            width: camera.width,
            pointerLeft: camera.pointerLeft ?? Math.round(iw / 2),
            pointerTop: camera.pointerTop ?? Math.round(ih / 2),
          };
        }

        scriptFrames.push(sf);
        currentFrame += totalFrames;
        break;
      }

      case 'clear-insight': {
        const frames = Math.max(Math.ceil((durationMs / 1000) * FPS), 1);
        scriptFrames.push({
          type: 'clear-insight',
          startFrame: currentFrame,
          durationInFrames: frames,
          title: script.title,
          subTitle: script.subTitle,
          taskId: script.taskId,
        });
        currentFrame += frames;
        break;
      }

      case 'spinning-pointer': {
        const frames = Math.max(Math.ceil((durationMs / 1000) * FPS), 1);
        scriptFrames.push({
          type: 'spinning-pointer',
          startFrame: currentFrame,
          durationInFrames: frames,
          title: script.title,
          subTitle: script.subTitle,
          taskId: script.taskId,
        });
        currentFrame += frames;
        break;
      }

      case 'pointer': {
        // Instantaneous — 0 frames
        scriptFrames.push({
          type: 'pointer',
          startFrame: currentFrame,
          durationInFrames: 0,
          pointerImg: script.img,
          title: script.title,
          subTitle: script.subTitle,
          taskId: script.taskId,
        });
        // No frame advancement
        break;
      }
    }
  }

  const stepsDurationInFrames = Math.max(currentFrame, 1);

  return {
    scriptFrames,
    totalDurationInFrames: openingFrames + stepsDurationInFrames + endingFrames,
    fps: FPS,
    openingDurationInFrames: openingFrames,
    endingDurationInFrames: endingFrames,
    stepsDurationInFrames,
    imageWidth: baseImageWidth,
    imageHeight: baseImageHeight,
    deviceType: options?.deviceType,
  };
}
