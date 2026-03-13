import { mouseLoading, mousePointer } from '../../../utils';
import { deriveFrameState } from './derive-frame-state';
import type { InsightOverlay } from './derive-frame-state';
import type { FrameMap } from './frame-calculator';
import { getPlaybackViewport } from './playback-layout';

const W = 960;
const H = 540;
const POINTER_PHASE = 0.375;
const CROSSFADE_FRAMES = 10;

// ── helpers ──

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
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

function drawInsightOverlays(
  ctx: CanvasRenderingContext2D,
  insights: InsightOverlay[],
  cameraTransform: { zoom: number; tx: number; ty: number },
  bx: number,
  contentY: number,
) {
  for (const insight of insights) {
    if (insight.alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= insight.alpha;

    if (insight.highlightElement) {
      const r = insight.highlightElement.rect;
      const rx =
        bx +
        (r.left * cameraTransform.zoom +
          cameraTransform.tx * cameraTransform.zoom);
      const ry =
        contentY +
        (r.top * cameraTransform.zoom +
          cameraTransform.ty * cameraTransform.zoom);
      const rw = r.width * cameraTransform.zoom;
      const rh = r.height * cameraTransform.zoom;

      ctx.fillStyle = 'rgba(253, 89, 7, 0.4)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#fd5907';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.shadowColor = 'rgba(51, 51, 51, 0.4)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    if (insight.searchArea) {
      const r = insight.searchArea;
      const rx =
        bx +
        (r.left * cameraTransform.zoom +
          cameraTransform.tx * cameraTransform.zoom);
      const ry =
        contentY +
        (r.top * cameraTransform.zoom +
          cameraTransform.ty * cameraTransform.zoom);
      const rw = r.width * cameraTransform.zoom;
      const rh = r.height * cameraTransform.zoom;

      ctx.fillStyle = 'rgba(2, 131, 145, 0.4)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#028391';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, rw, rh);
    }

    ctx.restore();
  }
}

// ── Spinning pointer Canvas drawing ──

function drawSpinningPointer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  elapsedMs: number,
) {
  const progress = (Math.sin(elapsedMs / 500 - Math.PI / 2) + 1) / 2;
  const rotation = progress * Math.PI * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(img, -11, -14, 22, 28);
  ctx.restore();
}

// ── Steps rendering ──

function drawSteps(
  ctx: CanvasRenderingContext2D,
  stepsFrame: number,
  frameMap: FrameMap,
  imgCache: Map<string, HTMLImageElement>,
  cursorImg: HTMLImageElement | null,
  spinnerImg: HTMLImageElement | null,
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
    insights,
  } = st;

  const pT = pointerMoved
    ? Math.min(rawProgress / POINTER_PHASE, 1)
    : rawProgress;
  const cT = pointerMoved
    ? rawProgress <= POINTER_PHASE
      ? 0
      : Math.min((rawProgress - POINTER_PHASE) / (1 - POINTER_PHASE), 1)
    : rawProgress;

  const camL = lerp(prevCamera.left, camera.left, cT);
  const camT2 = lerp(prevCamera.top, camera.top, cT);
  const camW = lerp(prevCamera.width, camera.width, cT);
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
    drawInsightOverlays(ctx, insights, { zoom, tx, ty }, offsetX, offsetY);
  }

  const camH = camW * (imgH / imgW);
  const sX = offsetX + ((ptrX - camL) / camW) * contentWidth;
  const sY = offsetY + ((ptrY - camT2) / camH) * contentHeight;

  const hasPtrData =
    Math.abs(camera.pointerLeft - Math.round(imgW / 2)) > 1 ||
    Math.abs(camera.pointerTop - Math.round(imgH / 2)) > 1 ||
    Math.abs(prevCamera.pointerLeft - Math.round(imgW / 2)) > 1 ||
    Math.abs(prevCamera.pointerTop - Math.round(imgH / 2)) > 1;

  if (spinning && spinnerImg) {
    drawSpinningPointer(ctx, spinnerImg, sX, sY, spinningElapsedMs);
  }

  if (!spinning && hasPtrData && cursorImg) {
    ctx.drawImage(cursorImg, sX - 3, sY - 2, 22, 28);
  }
}

// ── main export function ──

export async function exportBrandedVideo(
  frameMap: FrameMap,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const { totalDurationInFrames: total, fps } = frameMap;

  // 1. pre-load all images
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

  let cursorImg: HTMLImageElement | null = null;
  let spinnerImg: HTMLImageElement | null = null;
  try {
    cursorImg = await loadImage(mousePointer);
  } catch {
    /* optional */
  }
  try {
    spinnerImg = await loadImage(mouseLoading);
  } catch {
    /* optional */
  }

  // 2. canvas + recorder
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // 3. render loop
  return new Promise<void>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('MediaRecorder error'));
    recorder.onstop = () => {
      if (chunks.length === 0) {
        reject(new Error('No video data'));
        return;
      }
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'midscene_replay.webm';
      a.click();
      stream.getTracks().forEach((track) => track.stop());
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    };

    recorder.start();
    const frameDuration = 1000 / fps;
    const startTime = performance.now();
    let lastFrame = -1;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const targetFrame = Math.min(
        Math.floor(elapsed / frameDuration),
        total - 1,
      );

      if (targetFrame > lastFrame) {
        lastFrame = targetFrame;
        ctx.clearRect(0, 0, W, H);
        drawSteps(ctx, targetFrame, frameMap, imgCache, cursorImg, spinnerImg);
        onProgress?.((targetFrame + 1) / total);
      }

      if (targetFrame < total - 1) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => recorder.stop(), frameDuration * 2);
      }
    };

    requestAnimationFrame(tick);
  });
}
