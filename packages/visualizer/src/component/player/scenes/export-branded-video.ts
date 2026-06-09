import type { Rect } from '@midscene/core';
import { mouseLoading, mousePointer } from '../../../utils';
import { getCenterHighlightBox } from '../../../utils/highlight-element';
import { deriveFrameState, shouldRenderCursor } from './derive-frame-state';
import type { InsightOverlay } from './derive-frame-state';
import type { FrameMap } from './frame-calculator';
import { getPlaybackViewport } from './playback-layout';
import {
  type PointerLayout,
  resolveExportPointerLayout,
  resolveSpinnerLayout,
} from './pointer-layout';

const W = 960;
const H = 540;
const POINTER_PHASE = 0.375;
const CROSSFADE_FRAMES = 10;
const EXPORT_STALL_GRACE_MS = 2000;
const EXPORT_STALL_GRACE_FRAMES = 10;

let activeExport = false;

interface ExportOverlayViewport {
  offsetX: number;
  offsetY: number;
  contentWidth: number;
  contentHeight: number;
  imageWidth: number;
  imageHeight: number;
}

// ── helpers ──

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function isExportRenderStalled(
  elapsedSinceLastFrameMs: number,
  frameDurationMs: number,
): boolean {
  return (
    elapsedSinceLastFrameMs >
    Math.max(EXPORT_STALL_GRACE_MS, frameDurationMs * EXPORT_STALL_GRACE_FRAMES)
  );
}

export function resolveExportCamera(
  prevCamera: { left: number; top: number; width: number },
  camera: { left: number; top: number; width: number },
  imageWidth: number,
  progress: number,
  autoZoom: boolean,
) {
  if (!autoZoom) {
    return {
      camLeft: 0,
      camTop: 0,
      camWidth: imageWidth,
    };
  }
  return {
    camLeft: lerp(prevCamera.left, camera.left, progress),
    camTop: lerp(prevCamera.top, camera.top, progress),
    camWidth: lerp(prevCamera.width, camera.width, progress),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ── Insight overlay drawing ──

export function projectNativeRectToExportViewport(
  rect: Rect,
  cameraTransform: { zoom: number; tx: number; ty: number },
  viewport: ExportOverlayViewport,
): Rect {
  const scaleX = viewport.contentWidth / viewport.imageWidth;
  const scaleY = viewport.contentHeight / viewport.imageHeight;

  return {
    left:
      viewport.offsetX +
      (rect.left * scaleX + cameraTransform.tx) * cameraTransform.zoom,
    top:
      viewport.offsetY +
      (rect.top * scaleY + cameraTransform.ty) * cameraTransform.zoom,
    width: rect.width * scaleX * cameraTransform.zoom,
    height: rect.height * scaleY * cameraTransform.zoom,
  };
}

function drawInsightOverlays(
  ctx: CanvasRenderingContext2D,
  insights: InsightOverlay[],
  cameraTransform: { zoom: number; tx: number; ty: number },
  viewport: ExportOverlayViewport,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    viewport.offsetX,
    viewport.offsetY,
    viewport.contentWidth,
    viewport.contentHeight,
  );
  ctx.clip();

  for (const insight of insights) {
    if (insight.alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= insight.alpha;

    if (insight.highlightElement) {
      const highlightBox = getCenterHighlightBox(insight.highlightElement);
      const projected = projectNativeRectToExportViewport(
        highlightBox,
        cameraTransform,
        viewport,
      );

      ctx.fillStyle = 'rgba(253, 89, 7, 0.4)';
      ctx.fillRect(
        projected.left,
        projected.top,
        projected.width,
        projected.height,
      );
      ctx.strokeStyle = '#fd5907';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        projected.left,
        projected.top,
        projected.width,
        projected.height,
      );
      ctx.shadowColor = 'rgba(51, 51, 51, 0.4)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;
      ctx.strokeRect(
        projected.left,
        projected.top,
        projected.width,
        projected.height,
      );
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    if (insight.searchArea) {
      const projected = projectNativeRectToExportViewport(
        insight.searchArea,
        cameraTransform,
        viewport,
      );

      ctx.fillStyle = 'rgba(2, 131, 145, 0.4)';
      ctx.fillRect(
        projected.left,
        projected.top,
        projected.width,
        projected.height,
      );
      ctx.strokeStyle = '#028391';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        projected.left,
        projected.top,
        projected.width,
        projected.height,
      );
    }

    ctx.restore();
  }

  ctx.restore();
}

// ── Spinning pointer Canvas drawing ──

function drawSpinningPointer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  layout: PointerLayout,
  elapsedMs: number,
) {
  const progress = (Math.sin(elapsedMs / 500 - Math.PI / 2) + 1) / 2;
  const rotation = progress * Math.PI * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(
    img,
    -layout.centerOffsetX,
    -layout.centerOffsetY,
    layout.width,
    layout.height,
  );
  ctx.restore();
}

// ── Steps rendering ──

function drawSteps(
  ctx: CanvasRenderingContext2D,
  stepsFrame: number,
  frameMap: FrameMap,
  imgCache: Map<string, HTMLImageElement>,
  pointerCache: Map<string, HTMLImageElement>,
  spinnerImg: HTMLImageElement | null,
  autoZoom: boolean,
) {
  const { scriptFrames, imageWidth: baseW, imageHeight: baseH, fps } = frameMap;
  const st = deriveFrameState(scriptFrames, stepsFrame, baseW, baseH, fps);
  if (!st.img) return;

  const {
    img,
    prevImg,
    imageWidth: imgW,
    imageHeight: imgH,
    camera,
    prevCamera,
    pointerMoved,
    imageChanged,
    rawProgress,
    frameInScript: fInScript,
    spinning,
    spinningElapsedMs,
    currentPointerImg,
    pointerVisible,
    insights,
  } = st;

  // When focus on cursor is OFF, the camera does not zoom into the click point,
  // so the cursor "slide-in" animation (interpolating from the previous default
  // center to the new click target) is visually distracting and looks like the
  // cursor is in the wrong place. Snap straight to the target instead.
  const pT = !autoZoom
    ? 1
    : pointerMoved
      ? Math.min(rawProgress / POINTER_PHASE, 1)
      : rawProgress;
  const cT = pointerMoved
    ? rawProgress <= POINTER_PHASE
      ? 0
      : Math.min((rawProgress - POINTER_PHASE) / (1 - POINTER_PHASE), 1)
    : rawProgress;

  const {
    camLeft: camL,
    camTop: camT2,
    camWidth: camW,
  } = resolveExportCamera(prevCamera, camera, imgW, cT, autoZoom);
  const ptrX = lerp(prevCamera.pointerLeft, camera.pointerLeft, pT);
  const ptrY = lerp(prevCamera.pointerTop, camera.pointerTop, pT);

  const zoom = imgW / camW;
  const { offsetX, offsetY, contentWidth, contentHeight } = getPlaybackViewport(
    W,
    H,
    imgW,
    imgH,
  );
  const tx = -camL * (contentWidth / imgW);
  const ty = -camT2 * (contentHeight / imgH);

  const crossAlpha = imageChanged
    ? clamp(fInScript / CROSSFADE_FRAMES, 0, 1)
    : 1;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const drawImg = (src: string, alpha: number) => {
    const imgEl = imgCache.get(src);
    if (!imgEl || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.translate(offsetX + tx * zoom, offsetY + ty * zoom);
    ctx.scale(zoom, zoom);
    ctx.drawImage(imgEl, 0, 0, contentWidth, contentHeight);
    ctx.restore();
  };

  if (imageChanged && prevImg && crossAlpha < 1) {
    drawImg(prevImg, 1 - crossAlpha);
  }
  drawImg(img, imageChanged ? crossAlpha : 1);

  if (insights.length > 0) {
    drawInsightOverlays(
      ctx,
      insights,
      { zoom, tx, ty },
      {
        offsetX,
        offsetY,
        contentWidth,
        contentHeight,
        imageWidth: imgW,
        imageHeight: imgH,
      },
    );
  }

  const camH = camW * (imgH / imgW);
  const sX = offsetX + ((ptrX - camL) / camW) * contentWidth;
  const sY = offsetY + ((ptrY - camT2) / camH) * contentHeight;
  const pointerLayout = resolveExportPointerLayout(imgW, contentWidth);
  const spinnerLayout = resolveSpinnerLayout(pointerLayout);
  const cursorImg =
    pointerCache.get(currentPointerImg) ?? pointerCache.get(mousePointer);
  const showCursor = shouldRenderCursor(
    pointerVisible,
    camera,
    prevCamera,
    imgW,
    imgH,
  );

  if (spinning && spinnerImg) {
    drawSpinningPointer(
      ctx,
      spinnerImg,
      sX,
      sY,
      {
        ...pointerLayout,
        width: spinnerLayout.size,
        height: spinnerLayout.size,
        centerOffsetX: spinnerLayout.centerOffset,
        centerOffsetY: spinnerLayout.centerOffset,
      },
      spinningElapsedMs,
    );
  }

  if (!spinning && showCursor && cursorImg) {
    ctx.drawImage(
      cursorImg,
      sX - pointerLayout.hotspotX,
      sY - pointerLayout.hotspotY,
      pointerLayout.width,
      pointerLayout.height,
    );
  }
}

// ── main export function ──

export interface RecordBrandedVideoOptions {
  autoZoom?: boolean;
  scale?: number;
  // Render for a headless page (the Midscene CLI exporter) instead of an
  // interactive tab. Disables the "tab hidden" and "render stalled" interruption
  // guards: a headless page reports no visibility changes, and software
  // rendering is legitimately slow, so neither signal indicates a real problem.
  headless?: boolean;
}

export interface BrandedFrameRendererOptions {
  autoZoom?: boolean;
  scale?: number;
}

export interface BrandedFrameRenderer {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  renderFrame: (frameIndex: number) => void;
  renderFrameToBlob: (
    frameIndex: number,
    type?: string,
    quality?: number,
  ) => Promise<Blob>;
  renderFrameToDataURL: (
    frameIndex: number,
    type?: string,
    quality?: number,
  ) => string;
  dispose: () => void;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('failed to encode canvas frame'));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

export async function createBrandedFrameRenderer(
  frameMap: FrameMap,
  options?: BrandedFrameRendererOptions,
): Promise<BrandedFrameRenderer> {
  const { totalDurationInFrames: totalFrames, fps } = frameMap;
  const autoZoom = options?.autoZoom ?? true;
  const scale = options?.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('video frame scale must be a positive number');
  }

  const imgSrcs = new Set<string>();
  for (const sf of frameMap.scriptFrames) {
    if (sf.img) imgSrcs.add(sf.img);
  }
  const imgCache = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...imgSrcs].map(async (src) => {
      try {
        imgCache.set(src, await loadImage(src));
      } catch {
        /* skip */
      }
    }),
  );

  const pointerSrcs = new Set<string>([mousePointer]);
  for (const sf of frameMap.scriptFrames) {
    if (sf.pointerImg) pointerSrcs.add(sf.pointerImg);
  }

  const pointerCache = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...pointerSrcs].map(async (src) => {
      try {
        pointerCache.set(src, await loadImage(src));
      } catch {
        /* optional */
      }
    }),
  );

  let spinnerImg: HTMLImageElement | null = null;
  try {
    spinnerImg = await loadImage(mouseLoading);
  } catch {
    /* optional */
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('failed to create video canvas context');
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const renderFrame = (frameIndex: number) => {
    if (frameIndex < 0 || frameIndex >= totalFrames) {
      throw new Error(
        `video frame index ${frameIndex} out of range (0-${totalFrames - 1})`,
      );
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawSteps(
      ctx,
      frameIndex,
      frameMap,
      imgCache,
      pointerCache,
      spinnerImg,
      autoZoom,
    );
  };

  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    fps,
    totalFrames,
    renderFrame,
    renderFrameToBlob: (frameIndex, type, quality) => {
      renderFrame(frameIndex);
      return canvasToBlob(canvas, type, quality);
    },
    renderFrameToDataURL: (frameIndex, type, quality) => {
      renderFrame(frameIndex);
      return canvas.toDataURL(type ?? 'image/png', quality);
    },
    dispose: () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      imgCache.clear();
      pointerCache.clear();
      spinnerImg = null;
    },
  };
}

// MediaRecorder must be started with a timeslice, otherwise headless Chromium
// emits no `dataavailable` events and the resulting blob is empty.
const RECORDER_TIMESLICE_MS = 100;

export async function exportBrandedVideo(
  frameMap: FrameMap,
  options?: RecordBrandedVideoOptions,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const blob = await recordBrandedVideo(frameMap, options, onProgress);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'midscene_replay.webm';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function recordBrandedVideo(
  frameMap: FrameMap,
  options?: RecordBrandedVideoOptions,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  if (activeExport) {
    throw new Error('Video export is already in progress');
  }
  activeExport = true;
  try {
    return await runRecordBrandedVideo(frameMap, options, onProgress);
  } finally {
    activeExport = false;
  }
}

async function runRecordBrandedVideo(
  frameMap: FrameMap,
  options?: RecordBrandedVideoOptions,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const { totalDurationInFrames: total, fps } = frameMap;
  const autoZoom = options?.autoZoom ?? true;
  const headless = options?.headless ?? false;
  const renderer = await createBrandedFrameRenderer(frameMap, {
    autoZoom,
    scale: options?.scale,
  });
  const { canvas } = renderer;

  // captureStream(fps) lets the browser sample frames in lockstep with the
  // compositor; the rAF-driven loop below advances the compositor, so every
  // drawn frame is captured (this holds in headless too — rAF keeps running).
  // We deliberately do NOT use captureStream(0)+requestFrame: forcing every
  // drawn frame floods the software (swiftshader) encoder, which then drops
  // frames nondeterministically.
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // 3. render loop
  return new Promise<Blob>((resolve, reject) => {
    let stoppedByError: Error | null = null;
    let settled = false;
    let nextFrame = 0;
    let nextFrameDueAt = performance.now();
    let lastFrameAt = nextFrameDueAt;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let renderTimer: ReturnType<typeof setTimeout> | null = null;
    const frameDuration = 1000 / fps;

    const cleanup = () => {
      if (stopTimer) clearTimeout(stopTimer);
      if (renderTimer) clearTimeout(renderTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stream.getTracks().forEach((track) => track.stop());
      renderer.dispose();
    };

    const finishWithError = (error: Error) => {
      if (settled || stoppedByError) return;
      stoppedByError = error;
      if (recorder.state !== 'inactive') {
        recorder.stop();
      } else {
        cleanup();
        settled = true;
        reject(error);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        finishWithError(
          new Error(
            'Video export was interrupted because the report tab was hidden',
          ),
        );
      }
    };

    recorder.onerror = () => {
      finishWithError(new Error('MediaRecorder error'));
    };
    recorder.onstop = () => {
      cleanup();
      if (settled) return;
      settled = true;
      if (stoppedByError) {
        reject(stoppedByError);
        return;
      }
      if (chunks.length === 0) {
        reject(new Error('No video data'));
        return;
      }
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };

    if (!headless) {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    recorder.start(RECORDER_TIMESLICE_MS);

    // The loop is rAF-driven in both modes: captureStream(fps) samples frames in
    // lockstep with the compositor, and rAF is what advances the compositor, so
    // every drawn frame is captured. (Headless pages keep rAF running at full
    // rate.) setTimeout only paces frames to real time between rAF ticks.
    const scheduleNextFrame = () => {
      const delay = Math.max(0, nextFrameDueAt - performance.now());
      renderTimer = setTimeout(() => {
        requestAnimationFrame(renderFrame);
      }, delay);
    };

    const renderFrame = (timestamp: number) => {
      if (settled || recorder.state === 'inactive') return;
      if (
        !headless &&
        nextFrame > 0 &&
        isExportRenderStalled(timestamp - lastFrameAt, frameDuration)
      ) {
        finishWithError(
          new Error('Video export was interrupted because rendering stalled'),
        );
        return;
      }

      lastFrameAt = timestamp;
      renderer.renderFrame(nextFrame);
      onProgress?.((nextFrame + 1) / total);

      nextFrame += 1;
      if (nextFrame < total) {
        nextFrameDueAt += frameDuration;
        scheduleNextFrame();
      } else {
        stopTimer = setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
        }, frameDuration * 2);
      }
    };

    requestAnimationFrame((timestamp) => {
      lastFrameAt = timestamp;
      nextFrameDueAt = timestamp;
      renderFrame(timestamp);
    });
  });
}
