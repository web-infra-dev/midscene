/**
 * Shared frame state derivation from ScriptFrame timeline.
 * Used by both Remotion preview (StepScene.tsx) and Canvas export (export-branded-video.ts).
 */

import { mousePointer } from '../../../utils';
import type { ScriptFrame } from './frame-calculator';

export interface CameraState {
  left: number;
  top: number;
  width: number;
  pointerLeft: number;
  pointerTop: number;
}

export interface InsightOverlay {
  highlightElement?: ScriptFrame['highlightElement'];
  searchArea?: ScriptFrame['searchArea'];
  alpha: number;
}

export interface FrameState {
  img: string;
  imageWidth: number;
  imageHeight: number;
  prevImg: string | null;
  camera: CameraState;
  prevCamera: CameraState;
  insights: InsightOverlay[];
  spinning: boolean;
  spinningElapsedMs: number;
  currentPointerImg: string;
  title: string;
  subTitle: string;
  taskId: string | undefined;
  frameInScript: number;
  scriptIndex: number;
  imageChanged: boolean;
  pointerMoved: boolean;
  rawProgress: number;
}

/** Mutable accumulator used during frame state derivation */
interface Acc {
  img: string;
  imgW: number;
  imgH: number;
  camera: CameraState;
  prevCamera: CameraState;
  prevImg: string | null;
  insights: InsightOverlay[];
  spinning: boolean;
  spinningElapsedMs: number;
  pointerImg: string;
  title: string;
  subTitle: string;
  taskId: string | undefined;
  frameInScript: number;
  scriptIndex: number;
  imageChanged: boolean;
  pointerMoved: boolean;
  rawProgress: number;
}

// ── Per-type handlers ──

function updateImage(
  acc: Acc,
  sf: ScriptFrame,
  baseW: number,
  baseH: number,
): void {
  if (!sf.img) return;
  if (acc.img && sf.img !== acc.img) {
    acc.prevImg = acc.img;
    acc.imageChanged = true;
  }
  acc.img = sf.img;
  acc.imgW = sf.imageWidth || baseW;
  acc.imgH = sf.imageHeight || baseH;
}

function checkPointerMoved(prev: CameraState, cur: CameraState): boolean {
  return (
    Math.abs(prev.pointerLeft - cur.pointerLeft) > 1 ||
    Math.abs(prev.pointerTop - cur.pointerTop) > 1
  );
}

function handleImg(
  acc: Acc,
  sf: ScriptFrame,
  frame: number,
  baseW: number,
  baseH: number,
): void {
  updateImage(acc, sf, baseW, baseH);
  const sfEnd = sf.startFrame + sf.durationInFrames;
  if (sf.cameraTarget) {
    acc.prevCamera = { ...acc.camera };
    acc.camera = { ...sf.cameraTarget };
    acc.pointerMoved = checkPointerMoved(acc.prevCamera, acc.camera);
  } else if (frame >= sfEnd) {
    acc.pointerMoved = false;
    acc.imageChanged = false;
  }
  acc.spinning = false;
}

function handleInsight(
  acc: Acc,
  sf: ScriptFrame,
  frame: number,
  baseW: number,
  baseH: number,
): void {
  updateImage(acc, sf, baseW, baseH);

  const alreadyAdded = acc.insights.some(
    (ai) =>
      ai.highlightElement === sf.highlightElement &&
      ai.searchArea === sf.searchArea,
  );
  if (!alreadyAdded) {
    acc.insights.push({
      highlightElement: sf.highlightElement,
      searchArea: sf.searchArea,
      alpha: 1,
    });
  }

  if (sf.cameraTarget && sf.insightPhaseFrames !== undefined) {
    const cameraStartFrame = sf.startFrame + sf.insightPhaseFrames;
    if (frame >= cameraStartFrame) {
      acc.prevCamera = { ...acc.camera };
      acc.camera = { ...sf.cameraTarget };
      const cameraFrameIn = frame - cameraStartFrame;
      const cameraDur = sf.cameraPhaseFrames || 1;
      acc.rawProgress = Math.min(cameraFrameIn / cameraDur, 1);
      acc.pointerMoved = checkPointerMoved(acc.prevCamera, acc.camera);
    }
  }
  acc.spinning = false;
}

function handleClearInsight(acc: Acc, sf: ScriptFrame, frame: number): void {
  const sfEnd = sf.startFrame + sf.durationInFrames;
  const alpha = 1 - acc.rawProgress;
  acc.insights = acc.insights.map((ai) => ({ ...ai, alpha }));
  if (frame >= sfEnd) {
    acc.insights = [];
  }
  acc.spinning = false;
}

function handleSpinningPointer(acc: Acc, fps: number): void {
  acc.spinning = true;
  acc.spinningElapsedMs = (acc.frameInScript / fps) * 1000;
}

// ── Main derivation ──

export function deriveFrameState(
  scriptFrames: ScriptFrame[],
  frame: number,
  baseW: number,
  baseH: number,
  fps: number,
): FrameState {
  const defaultCamera: CameraState = {
    left: 0,
    top: 0,
    width: baseW,
    pointerLeft: Math.round(baseW / 2),
    pointerTop: Math.round(baseH / 2),
  };

  const acc: Acc = {
    img: '',
    imgW: baseW,
    imgH: baseH,
    camera: { ...defaultCamera },
    prevCamera: { ...defaultCamera },
    prevImg: null,
    insights: [],
    spinning: false,
    spinningElapsedMs: 0,
    pointerImg: mousePointer,
    title: '',
    subTitle: '',
    taskId: undefined,
    frameInScript: 0,
    scriptIndex: 0,
    imageChanged: false,
    pointerMoved: false,
    rawProgress: 0,
  };

  for (let i = 0; i < scriptFrames.length; i++) {
    const sf = scriptFrames[i];
    const sfEnd = sf.startFrame + sf.durationInFrames;

    if (sf.durationInFrames === 0) {
      if (sf.startFrame <= frame) {
        if (sf.type === 'pointer' && sf.pointerImg) {
          acc.pointerImg = sf.pointerImg;
        }
        acc.title = sf.title || acc.title;
        acc.subTitle = sf.subTitle || acc.subTitle;
        acc.taskId = sf.taskId ?? acc.taskId;
        acc.scriptIndex = i;
      }
      continue;
    }

    if (frame < sf.startFrame) break;

    acc.title = sf.title || acc.title;
    acc.subTitle = sf.subTitle || acc.subTitle;
    acc.taskId = sf.taskId ?? acc.taskId;
    acc.scriptIndex = i;
    acc.frameInScript = frame - sf.startFrame;
    acc.rawProgress = Math.min(acc.frameInScript / sf.durationInFrames, 1);

    switch (sf.type) {
      case 'img':
        handleImg(acc, sf, frame, baseW, baseH);
        break;
      case 'insight':
        handleInsight(acc, sf, frame, baseW, baseH);
        break;
      case 'clear-insight':
        handleClearInsight(acc, sf, frame);
        break;
      case 'spinning-pointer':
        handleSpinningPointer(acc, fps);
        break;
      case 'sleep':
        acc.spinning = false;
        break;
    }

    if (frame >= sfEnd) {
      if (sf.type !== 'clear-insight') acc.imageChanged = false;
      acc.pointerMoved = false;
      acc.rawProgress = 1;
      if (sf.cameraTarget) {
        acc.prevCamera = { ...acc.camera };
      }
    }
  }

  if (!acc.img) {
    const firstImgScript = scriptFrames.find(
      (sf) => sf.type === 'img' && sf.img,
    );
    if (firstImgScript) {
      acc.img = firstImgScript.img!;
      acc.imgW = firstImgScript.imageWidth || baseW;
      acc.imgH = firstImgScript.imageHeight || baseH;
    }
  }

  return {
    img: acc.img,
    imageWidth: acc.imgW,
    imageHeight: acc.imgH,
    prevImg: acc.imageChanged ? acc.prevImg : null,
    camera: acc.camera,
    prevCamera: acc.prevCamera,
    insights: acc.insights,
    spinning: acc.spinning,
    spinningElapsedMs: acc.spinningElapsedMs,
    currentPointerImg: acc.pointerImg,
    title: acc.title,
    subTitle: acc.subTitle,
    taskId: acc.taskId,
    frameInScript: acc.frameInScript,
    scriptIndex: acc.scriptIndex,
    imageChanged: acc.imageChanged,
    pointerMoved: acc.pointerMoved,
    rawProgress: acc.rawProgress,
  };
}
