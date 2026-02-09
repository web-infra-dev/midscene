import { mousePointer } from '../../../utils';
import { LogoUrl } from '../../logo';
import type { FrameMap, StepSegment } from './frame-calculator';

const W = 960;
const H = 540;
const POINTER_PHASE = 0.375;
const CROSSFADE_FRAMES = 10;

// ── helpers ──────────────────────────────────────────────

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ── flat timeline (shared logic with StepsTimeline.tsx) ──

interface FlatKf {
  img: string;
  cameraLeft: number;
  cameraTop: number;
  cameraWidth: number;
  pointerLeft: number;
  pointerTop: number;
  localStart: number;
  duration: number;
  title: string;
  stepIndex: number;
  imageWidth: number;
  imageHeight: number;
}

function buildTimeline(segments: StepSegment[]): FlatKf[] {
  const off = segments[0]?.startFrame ?? 0;
  return segments.flatMap((seg) =>
    seg.keyframes.map((kf) => ({
      img: kf.img,
      cameraLeft: kf.cameraLeft,
      cameraTop: kf.cameraTop,
      cameraWidth: kf.cameraWidth,
      pointerLeft: kf.pointerLeft,
      pointerTop: kf.pointerTop,
      localStart: seg.startFrame - off + kf.startFrame,
      duration: kf.durationInFrames,
      title: seg.title,
      stepIndex: seg.stepIndex,
      imageWidth: seg.imageWidth,
      imageHeight: seg.imageHeight,
    })),
  );
}

function findSegStartLocal(segments: StepSegment[], stepIndex: number): number {
  const off = segments[0]?.startFrame ?? 0;
  const seg = segments.find((s) => s.stepIndex === stepIndex);
  return seg ? seg.startFrame - off : 0;
}

// ── gradient helper ──────────────────────────────────────

function drawDarkGradient(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0a0a1a');
  g.addColorStop(1, '#1a1a3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ── scene renderers ──────────────────────────────────────

function drawOpening(
  ctx: CanvasRenderingContext2D,
  f: number,
  dur: number,
  logo: HTMLImageElement | null,
) {
  drawDarkGradient(ctx);

  const opacity = clamp(
    f < 20 ? f / 20 : f > dur - 20 ? (dur - f) / 20 : 1,
    0,
    1,
  );
  const scale = clamp(f / 12, 0, 1); // simplified spring
  const ty = f > dur - 30 ? ((f - (dur - 30)) / 30) * -60 : 0;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(W / 2, H / 2 + ty);
  ctx.scale(scale, scale);

  if (logo) {
    ctx.drawImage(logo, -60, -80, 120, 120);
  }

  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText('Midscene', 0, 80);
  ctx.restore();
}

function drawEnding(
  ctx: CanvasRenderingContext2D,
  f: number,
  dur: number,
  logo: HTMLImageElement | null,
) {
  drawDarkGradient(ctx);

  const fadeIn = clamp(f / 20, 0, 1);
  const fadeOut = clamp((dur - f) / 20, 0, 1);
  const opacity = fadeIn * fadeOut;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(W / 2, H / 2);

  if (logo) {
    ctx.drawImage(logo, -40, -60, 80, 80);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '500 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Powered by Midscene', 0, 48);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '14px sans-serif';
  ctx.fillText('midscenejs.com', 0, 72);
  ctx.restore();
}

function drawSteps(
  ctx: CanvasRenderingContext2D,
  stepsFrame: number,
  segments: StepSegment[],
  timeline: FlatKf[],
  imgCache: Map<string, HTMLImageElement>,
  cursorImg: HTMLImageElement | null,
) {
  if (timeline.length === 0) return;

  // locate keyframe
  let ci = 0;
  for (let i = 0; i < timeline.length; i++) {
    const kf = timeline[i];
    if (
      stepsFrame >= kf.localStart &&
      stepsFrame < kf.localStart + kf.duration
    ) {
      ci = i;
      break;
    }
    if (i === timeline.length - 1) ci = i;
  }

  const curr = timeline[ci];
  const prev = ci > 0 ? timeline[ci - 1] : curr;
  const raw = clamp((stepsFrame - curr.localStart) / curr.duration, 0, 1);

  // pointer leads / camera follows
  const pMoved =
    Math.abs(prev.pointerLeft - curr.pointerLeft) > 1 ||
    Math.abs(prev.pointerTop - curr.pointerTop) > 1;
  const pT = pMoved ? Math.min(raw / POINTER_PHASE, 1) : raw;
  const cT = pMoved
    ? raw <= POINTER_PHASE
      ? 0
      : easeInOut((raw - POINTER_PHASE) / (1 - POINTER_PHASE))
    : easeInOut(raw);

  const camL = lerp(prev.cameraLeft, curr.cameraLeft, cT);
  const camT = lerp(prev.cameraTop, curr.cameraTop, cT);
  const camW = lerp(prev.cameraWidth, curr.cameraWidth, cT);
  const ptrX = lerp(prev.pointerLeft, curr.pointerLeft, pT);
  const ptrY = lerp(prev.pointerTop, curr.pointerTop, pT);

  const imgW = curr.imageWidth;
  const imgH = curr.imageHeight;
  const zoom = imgW / camW;
  const tx = -camL * (W / imgW);
  const ty = -camT * (H / imgH);

  // initial fade (opening → steps)
  const initAlpha = clamp(stepsFrame / 8, 0, 1);

  // image crossfade
  const imgChanged = ci > 0 && prev.img !== curr.img;
  const crossAlpha = imgChanged
    ? clamp((stepsFrame - curr.localStart) / CROSSFADE_FRAMES, 0, 1)
    : 1;

  ctx.save();
  ctx.globalAlpha = initAlpha;

  // helper to draw a screenshot with camera transform
  const drawImg = (src: string, alpha: number) => {
    const img = imgCache.get(src);
    if (!img || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * alpha;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.translate(tx * zoom, ty * zoom);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();
  };

  // draw prev then curr during crossfade
  if (imgChanged && crossAlpha < 1) {
    drawImg(prev.img, 1 - crossAlpha);
  }
  drawImg(curr.img, imgChanged ? crossAlpha : 1);

  // cursor
  const camH = camW * (imgH / imgW);
  const sX = ((ptrX - camL) / camW) * W;
  const sY = ((ptrY - camT) / camH) * H;
  if (zoom > 1.08 && cursorImg) {
    ctx.drawImage(cursorImg, sX - 3, sY - 2, 22, 28);
  }

  // badge
  const stepStart = findSegStartLocal(segments, curr.stepIndex);
  const fInStep = stepsFrame - stepStart;
  const bScale = clamp((fInStep - 5) / 10, 0, 1);
  if (bScale > 0) {
    ctx.save();
    ctx.translate(40, 40);
    ctx.scale(bScale, bScale);
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#2B83FF';
    ctx.fill();
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(curr.stepIndex + 1), 0, 0);
    ctx.restore();
  }

  // title card
  const tAlpha = clamp((fInStep - 5) / 15, 0, 1);
  const tY = H - 16 - 20 + (1 - tAlpha) * 40;
  if (tAlpha > 0 && curr.title) {
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * tAlpha;
    ctx.font = '500 16px sans-serif';
    const tw = Math.min(ctx.measureText(curr.title).width + 48, W * 0.8);
    const rx = (W - tw) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(ctx, rx, tY, tw, 36, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(curr.title, W / 2, tY + 18, W * 0.75);
    ctx.restore();
  }

  ctx.restore();
}

function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  f: number,
  total: number,
) {
  const pct = f / total;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(0, H - 4, W, 4);
  ctx.fillStyle = '#2B83FF';
  ctx.fillRect(0, H - 4, W * pct, 4);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── main export function ─────────────────────────────────

export async function exportBrandedVideo(
  frameMap: FrameMap,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const {
    totalDurationInFrames: total,
    fps,
    segments,
    openingDurationInFrames: openDur,
    endingDurationInFrames: endDur,
  } = frameMap;

  // 1. pre-load all images
  const imgSrcs = new Set<string>();
  for (const seg of segments) {
    for (const kf of seg.keyframes) imgSrcs.add(kf.img);
  }
  const imgCache = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...imgSrcs].map(async (src) => {
      try {
        imgCache.set(src, await loadImage(src));
      } catch {
        /* skip broken images */
      }
    }),
  );

  let logoImg: HTMLImageElement | null = null;
  let cursorImg: HTMLImageElement | null = null;
  try {
    logoImg = await loadImage(LogoUrl);
  } catch {
    /* logo optional */
  }
  try {
    cursorImg = await loadImage(mousePointer);
  } catch {
    /* cursor optional */
  }

  // 2. flat timeline
  const timeline = buildTimeline(segments);

  // 3. canvas + recorder
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

  // 4. render loop — real-time so MediaRecorder timestamps are correct
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
      a.download = 'midscene_branded.webm';
      a.click();
      URL.revokeObjectURL(url);
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
        const f = targetFrame;

        // clear
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        if (f < openDur) {
          drawOpening(ctx, f, openDur, logoImg);
        } else if (f >= total - endDur) {
          drawEnding(ctx, f - (total - endDur), endDur, logoImg);
        } else {
          drawSteps(ctx, f - openDur, segments, timeline, imgCache, cursorImg);
        }

        drawProgressBar(ctx, f, total);
        onProgress?.(f / total);
      }

      if (targetFrame < total - 1) {
        requestAnimationFrame(tick);
      } else {
        // render the very last frame, then stop
        setTimeout(() => {
          recorder.stop();
        }, frameDuration * 2);
      }
    };

    requestAnimationFrame(tick);
  });
}
