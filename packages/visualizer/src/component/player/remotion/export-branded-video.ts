import { mousePointer } from '../../../utils';
import { LogoUrl } from '../../logo';
import type { FrameMap, StepSegment } from './frame-calculator';
import {
  CHROME_BORDER_RADIUS,
  CHROME_DOTS,
  CHROME_TITLE_BAR_H,
  CYBER_CYAN,
  CYBER_MAGENTA,
  getBrowser3DTransform,
  getCursorTrail,
  getCyberParticleColor,
  getDataStream,
  getGlitchSlices,
  getGridLines,
  getImageBlur,
  getLogoBreathing,
  getNeonFlicker,
  getParticleState,
  getParticles,
  getRippleState,
  getScanlineOffset,
  getTypewriterChars,
  getVerticalGridLines,
} from './visual-effects';

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

// ── cyberpunk background ─────────────────────────────────

function drawCyberBackground(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H * 1.2, 0, W / 2, H / 2, W);
  g.addColorStop(0, '#0a0a2e');
  g.addColorStop(0.5, '#050510');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ── perspective grid ─────────────────────────────────────

function drawCyberGrid(ctx: CanvasRenderingContext2D, frame: number) {
  const gridH = getGridLines(frame);
  const gridV = getVerticalGridLines();

  ctx.save();
  ctx.globalAlpha = 0.5;

  // Horizontal lines
  for (const line of gridH) {
    const y = line.y * H;
    ctx.strokeStyle = `rgba(0, 255, 255, ${line.alpha * 0.4})`;
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(0, 255, 255, 0.3)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Vertical lines (bottom half only)
  ctx.shadowBlur = 3;
  for (const line of gridV) {
    const x = line.x * W;
    ctx.strokeStyle = `rgba(0, 255, 255, ${line.alpha * 0.3})`;
    ctx.beginPath();
    ctx.moveTo(x, H * 0.45);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ── neon particle renderer ───────────────────────────────

function drawCyberParticles(ctx: CanvasRenderingContext2D, frame: number) {
  const particles = getParticles();
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const s = getParticleState(p, frame);
    const color = getCyberParticleColor(i);
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
    ctx.shadowColor = `rgba(${color.r},${color.g},${color.b},0.6)`;
    ctx.shadowBlur = s.size * 3;
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, (s.size * 1.5) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── scan lines ───────────────────────────────────────────

function drawScanlines(
  ctx: CanvasRenderingContext2D,
  frame: number,
  alpha = 0.08,
) {
  const offset = getScanlineOffset(frame);
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  for (let y = offset; y < H; y += 4) {
    ctx.fillRect(0, y, W, 1);
  }
  ctx.restore();
}

// ── vignette ─────────────────────────────────────────────

function drawVignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ── HUD corners ──────────────────────────────────────────

function drawHudCorners(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  margin = 12,
  size = 20,
) {
  ctx.save();
  ctx.strokeStyle = `rgba(0, 255, 255, ${0.6 * alpha})`;
  ctx.lineWidth = 2;
  const corners = [
    { x: margin, y: margin, dx: 1, dy: 1 },
    { x: W - margin, y: margin, dx: -1, dy: 1 },
    { x: margin, y: H - margin, dx: 1, dy: -1 },
    { x: W - margin, y: H - margin, dx: -1, dy: -1 },
  ];
  for (const c of corners) {
    ctx.beginPath();
    ctx.moveTo(c.x, c.y + c.dy * size);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(c.x + c.dx * size, c.y);
    ctx.stroke();
  }
  ctx.restore();
}

// ── data stream ──────────────────────────────────────────

function drawDataStream(
  ctx: CanvasRenderingContext2D,
  frame: number,
  x: number,
  y: number,
  length: number,
  alpha: number,
) {
  const data = getDataStream(frame, length);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(data.chars, x, y);
  ctx.restore();
}

// ── chrome browser shell ─────────────────────────────────

const BROWSER_MARGIN = 24;

function drawChromeTitleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  const h = CHROME_TITLE_BAR_H;
  // Title bar background
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#2a2a35');
  g.addColorStop(1, '#1e1e28');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, 0);
  // Round top corners only
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + CHROME_BORDER_RADIUS, y);
  ctx.lineTo(x + w - CHROME_BORDER_RADIUS, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + CHROME_BORDER_RADIUS);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + CHROME_BORDER_RADIUS);
  ctx.quadraticCurveTo(x, y, x + CHROME_BORDER_RADIUS, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Bottom border
  ctx.strokeStyle = 'rgba(0,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();

  // Traffic lights
  for (const dot of CHROME_DOTS) {
    ctx.beginPath();
    ctx.arc(x + dot.x, y + h / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = dot.color;
    ctx.fill();
  }

  // Address bar
  const abx = x + 70;
  const aby = y + h / 2 - 11;
  const abw = w - 84;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, abx, aby, abw, 22, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  roundRect(ctx, abx, aby, abw, 22, 6);
  ctx.stroke();

  // URL text
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,255,255,0.4)';
  ctx.fillText('https://', abx + 10, y + h / 2);
  const protoW = ctx.measureText('https://').width;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('app.example.com', abx + 10 + protoW, y + h / 2);
}

// ── scene renderers ──────────────────────────────────────

function drawOpening(
  ctx: CanvasRenderingContext2D,
  f: number,
  dur: number,
  logo: HTMLImageElement | null,
) {
  drawCyberBackground(ctx);
  drawCyberGrid(ctx, f);
  drawCyberParticles(ctx, f);

  const opacity = clamp(
    f < 20 ? f / 20 : f > dur - 20 ? (dur - f) / 20 : 1,
    0,
    1,
  );
  const scale = clamp(f / 12, 0, 1);
  const ty = f > dur - 30 ? ((f - (dur - 30)) / 30) * -60 : 0;
  const breathing = getLogoBreathing(f);
  const flicker = getNeonFlicker(f);

  ctx.save();
  ctx.globalAlpha = opacity * flicker;
  ctx.translate(W / 2, H / 2 + ty);
  ctx.scale(scale * breathing.scale, scale * breathing.scale);

  if (logo) {
    ctx.save();
    // Dual glow: cyan + magenta
    ctx.shadowColor = `rgba(0,255,255,${breathing.glowIntensity})`;
    ctx.shadowBlur = breathing.glowRadius;
    ctx.drawImage(logo, -60, -80, 120, 120);
    ctx.shadowColor = `rgba(255,0,255,${breathing.glowIntensity * 0.4})`;
    ctx.shadowBlur = breathing.glowRadius * 2;
    ctx.drawImage(logo, -60, -80, 120, 120);
    ctx.restore();
  }

  // Neon title text
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Glow layers
  ctx.shadowColor = 'rgba(0,255,255,0.8)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#fff';
  ctx.fillText('Midscene', 0, 80);
  ctx.shadowBlur = 0;

  // Chromatic aberration subtitle
  ctx.font = '14px monospace';
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = `rgb(${CYBER_CYAN.r},${CYBER_CYAN.g},${CYBER_CYAN.b})`;
  ctx.fillText('AI-POWERED AUTOMATION', -1, 110);
  ctx.fillStyle = `rgb(${CYBER_MAGENTA.r},${CYBER_MAGENTA.g},${CYBER_MAGENTA.b})`;
  ctx.fillText('AI-POWERED AUTOMATION', 1, 110);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('AI-POWERED AUTOMATION', 0, 110);

  ctx.restore();

  // HUD
  const hudAlpha = clamp((f - 10) / 20, 0, 1);
  drawHudCorners(ctx, hudAlpha);
  drawDataStream(ctx, f, 20, H - 20, 32, hudAlpha * 0.5);
  drawScanlines(ctx, f);
  drawVignette(ctx);
}

function drawEnding(
  ctx: CanvasRenderingContext2D,
  f: number,
  dur: number,
  logo: HTMLImageElement | null,
) {
  drawCyberBackground(ctx);
  drawCyberGrid(ctx, f);
  drawCyberParticles(ctx, f);

  const fadeIn = clamp(f / 20, 0, 1);
  const fadeOut = clamp((dur - f) / 20, 0, 1);
  const opacity = fadeIn * fadeOut;
  const flicker = getNeonFlicker(f);

  ctx.save();
  ctx.globalAlpha = opacity * flicker;
  ctx.translate(W / 2, H / 2);

  if (logo) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,255,255,0.5)';
    ctx.shadowBlur = 12;
    ctx.drawImage(logo, -40, -60, 80, 80);
    ctx.shadowColor = 'rgba(255,0,255,0.3)';
    ctx.shadowBlur = 24;
    ctx.drawImage(logo, -40, -60, 80, 80);
    ctx.restore();
  }

  // Neon text
  ctx.font = '500 20px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,255,255,0.6)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('Powered by Midscene', 0, 48);
  ctx.shadowBlur = 0;

  // Chromatic URL
  ctx.font = '14px monospace';
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = `rgb(${CYBER_CYAN.r},${CYBER_CYAN.g},${CYBER_CYAN.b})`;
  ctx.fillText('midscenejs.com', -1, 72);
  ctx.fillStyle = `rgb(${CYBER_MAGENTA.r},${CYBER_MAGENTA.g},${CYBER_MAGENTA.b})`;
  ctx.fillText('midscenejs.com', 1, 72);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('midscenejs.com', 0, 72);

  ctx.restore();

  drawHudCorners(ctx, opacity * 0.7);
  drawDataStream(ctx, f, W - 200, H - 20, 24, opacity * 0.4);
  drawScanlines(ctx, f);
  drawVignette(ctx);
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
  const camT2 = lerp(prev.cameraTop, curr.cameraTop, cT);
  const camW = lerp(prev.cameraWidth, curr.cameraWidth, cT);
  const ptrX = lerp(prev.pointerLeft, curr.pointerLeft, pT);
  const ptrY = lerp(prev.pointerTop, curr.pointerTop, pT);

  const imgW = curr.imageWidth;
  const imgH = curr.imageHeight;

  // Browser shell dimensions
  const browserW = W - BROWSER_MARGIN * 2;
  const contentH = H - BROWSER_MARGIN * 2 - CHROME_TITLE_BAR_H;
  const browserH = contentH + CHROME_TITLE_BAR_H;
  const bx = BROWSER_MARGIN;
  const by = BROWSER_MARGIN;

  // Camera transform relative to content area
  const zoom = imgW / camW;
  const tx = -camL * (browserW / imgW);
  const ty = -camT2 * (contentH / imgH);

  const initAlpha = clamp(stepsFrame / 8, 0, 1);

  const imgChanged = ci > 0 && prev.img !== curr.img;
  const crossAlpha = imgChanged
    ? clamp((stepsFrame - curr.localStart) / CROSSFADE_FRAMES, 0, 1)
    : 1;

  const framesIntoKf = stepsFrame - curr.localStart;
  const blurPx = getImageBlur(framesIntoKf, imgChanged);

  const stepStart = findSegStartLocal(segments, curr.stepIndex);
  const fInStep = stepsFrame - stepStart;

  // 3D transform (simulated with scale in Canvas 2D)
  // 3D transform — only on the first step
  const isFirstStep = curr.stepIndex === 0;
  const transform3d = isFirstStep
    ? getBrowser3DTransform(fInStep, stepsFrame)
    : { rotateX: 0, rotateY: 0, translateZ: 0, scale: 1 };

  // Dark background
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = initAlpha;

  // Apply 3D-like transform: translate to center, scale, translate back
  const centerX = bx + browserW / 2;
  const centerY = by + browserH / 2;
  ctx.translate(centerX, centerY);
  ctx.scale(transform3d.scale, transform3d.scale);
  ctx.translate(-centerX, -centerY);

  // Browser shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#1e1e28';
  roundRect(ctx, bx, by, browserW, browserH, CHROME_BORDER_RADIUS);
  ctx.fill();
  ctx.restore();

  // Chrome title bar
  drawChromeTitleBar(ctx, bx, by, browserW);

  // Content area — clip to browser bounds
  const contentY = by + CHROME_TITLE_BAR_H;

  ctx.save();
  ctx.beginPath();
  // Bottom rounded corners only
  ctx.moveTo(bx, contentY);
  ctx.lineTo(bx + browserW, contentY);
  ctx.lineTo(bx + browserW, contentY + contentH - CHROME_BORDER_RADIUS);
  ctx.quadraticCurveTo(
    bx + browserW,
    contentY + contentH,
    bx + browserW - CHROME_BORDER_RADIUS,
    contentY + contentH,
  );
  ctx.lineTo(bx + CHROME_BORDER_RADIUS, contentY + contentH);
  ctx.quadraticCurveTo(
    bx,
    contentY + contentH,
    bx,
    contentY + contentH - CHROME_BORDER_RADIUS,
  );
  ctx.closePath();
  ctx.clip();

  // Black background for content
  ctx.fillStyle = '#000';
  ctx.fillRect(bx, contentY, browserW, contentH);

  // Helper to draw screenshot within content area
  const drawImg = (src: string, alpha: number, applyBlur = false) => {
    const img = imgCache.get(src);
    if (!img || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * alpha;
    if (applyBlur && blurPx > 0) {
      ctx.filter = `blur(${blurPx}px)`;
    }
    ctx.beginPath();
    ctx.rect(bx, contentY, browserW, contentH);
    ctx.clip();
    ctx.translate(bx + tx * zoom, contentY + ty * zoom);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, 0, 0, browserW, contentH);
    ctx.restore();
  };

  // Draw prev then curr during crossfade
  if (imgChanged && crossAlpha < 1) {
    drawImg(prev.img, 1 - crossAlpha);
  }
  drawImg(curr.img, imgChanged ? crossAlpha : 1, true);

  // Glitch slices
  if (imgChanged) {
    const glitchSlices = getGlitchSlices(stepsFrame, curr.localStart);
    for (const slice of glitchSlices) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = 'rgba(0,255,255,1)';
      ctx.fillRect(
        bx + slice.offsetX + slice.rgbSplit,
        contentY + slice.y * contentH,
        browserW,
        slice.height * contentH,
      );
      ctx.fillStyle = 'rgba(255,0,255,1)';
      ctx.fillRect(
        bx + slice.offsetX - slice.rgbSplit,
        contentY + slice.y * contentH,
        browserW,
        slice.height * contentH,
      );
      ctx.restore();
    }
  }

  // Pointer screen position (relative to content area)
  const camH = camW * (imgH / imgW);
  const sX = bx + ((ptrX - camL) / camW) * browserW;
  const sY = contentY + ((ptrY - camT2) / camH) * contentH;

  // Cursor trail
  if (zoom > 1.08 && pMoved) {
    const trailPositions: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const pastFrame = stepsFrame - i;
      if (pastFrame < curr.localStart) break;
      const pastRaw = clamp(
        (pastFrame - curr.localStart) / curr.duration,
        0,
        1,
      );
      const pastPT = pMoved ? Math.min(pastRaw / POINTER_PHASE, 1) : pastRaw;
      const pastCT = pMoved
        ? pastRaw <= POINTER_PHASE
          ? 0
          : easeInOut((pastRaw - POINTER_PHASE) / (1 - POINTER_PHASE))
        : easeInOut(pastRaw);
      const pastPtrX = lerp(prev.pointerLeft, curr.pointerLeft, pastPT);
      const pastPtrY = lerp(prev.pointerTop, curr.pointerTop, pastPT);
      const pastCamL = lerp(prev.cameraLeft, curr.cameraLeft, pastCT);
      const pastCamT = lerp(prev.cameraTop, curr.cameraTop, pastCT);
      const pastCamW = lerp(prev.cameraWidth, curr.cameraWidth, pastCT);
      const pastCamH = pastCamW * (imgH / imgW);
      trailPositions.push({
        x: bx + ((pastPtrX - pastCamL) / pastCamW) * browserW,
        y: contentY + ((pastPtrY - pastCamT) / pastCamH) * contentH,
      });
    }
    const trail = getCursorTrail(trailPositions);
    for (const pt of trail) {
      ctx.save();
      ctx.globalAlpha = pt.alpha;
      ctx.fillStyle = 'rgba(0,255,255,1)';
      ctx.shadowColor = 'rgba(0,255,255,0.8)';
      ctx.shadowBlur = pt.size;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Cursor
  if (zoom > 1.08 && cursorImg) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,255,255,0.6)';
    ctx.shadowBlur = 4;
    ctx.drawImage(cursorImg, sX - 3, sY - 2, 22, 28);
    ctx.restore();
  }

  // Click ripple — dual neon rings
  if (pMoved) {
    const pointerArrivalFrame =
      curr.localStart + Math.floor(curr.duration * POINTER_PHASE);
    const framesAfterArrival = stepsFrame - pointerArrivalFrame;
    const ripple = getRippleState(framesAfterArrival);
    if (ripple.active) {
      ctx.save();
      ctx.strokeStyle = `rgba(0,255,255,${ripple.opacity})`;
      ctx.shadowColor = `rgba(0,255,255,${ripple.opacity * 0.6})`;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sX, sY, ripple.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const ripple2 = getRippleState(framesAfterArrival - 3);
    if (ripple2.active) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,0,255,${ripple2.opacity * 0.7})`;
      ctx.shadowColor = `rgba(255,0,255,${ripple2.opacity * 0.4})`;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sX, sY, ripple2.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Scan lines inside content
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  const scanOff = getScanlineOffset(stepsFrame);
  for (let y = contentY + scanOff; y < contentY + contentH; y += 4) {
    ctx.fillRect(bx, y, browserW, 1);
  }
  ctx.restore();

  ctx.restore(); // end content clip

  // Neon edge glow on browser frame
  ctx.save();
  ctx.strokeStyle = 'rgba(0,255,255,0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, browserW, browserH, CHROME_BORDER_RADIUS);
  ctx.stroke();
  ctx.restore();

  // Badge — top-left, outside browser
  const bScale = clamp((fInStep - 5) / 10, 0, 1);
  if (bScale > 0) {
    ctx.save();
    ctx.translate(26, 26);
    ctx.scale(bScale, bScale);
    ctx.fillStyle = 'rgba(0, 20, 40, 0.9)';
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(0,255,255,0.3)';
    ctx.shadowBlur = 8;
    roundRect(ctx, -18, -18, 36, 36, 4);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#0ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,255,255,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(String(curr.stepIndex + 1), 0, 0);
    ctx.restore();
  }

  // Title card — bottom center, outside browser
  const flicker = getNeonFlicker(stepsFrame);
  const tAlpha = clamp((fInStep - 5) / 15, 0, 1);
  const tYPos = H - 6 - 16 + (1 - tAlpha) * 40;
  if (tAlpha > 0 && curr.title) {
    const typewriter = getTypewriterChars(curr.title, fInStep, 8, 1.5);
    const displayText = typewriter.text + (typewriter.showCursor ? '_' : '');
    ctx.save();
    ctx.globalAlpha = initAlpha * tAlpha * flicker;
    ctx.font = '500 14px monospace';
    const tw = Math.min(ctx.measureText(curr.title).width + 40, W * 0.8);
    const rx = (W - tw) / 2;
    ctx.fillStyle = 'rgba(0, 10, 20, 0.9)';
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.shadowColor = 'rgba(0,255,255,0.15)';
    ctx.shadowBlur = 12;
    roundRect(ctx, rx, tYPos, tw, 32, 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,255,255,0.4)';
    ctx.shadowBlur = 4;
    ctx.fillText(displayText, W / 2, tYPos + 16, W * 0.75);
    ctx.restore();
  }

  // HUD corners
  drawHudCorners(ctx, 0.3, 8, 16);

  ctx.restore();
}

function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  f: number,
  total: number,
) {
  const pct = f / total;
  // Dark track
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, H - 4, W, 4);
  // Neon cyan bar with glow
  ctx.save();
  ctx.shadowColor = 'rgba(0,255,255,0.5)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#0ff';
  ctx.fillRect(0, H - 4, W * pct, 4);
  ctx.restore();
  // Bright tip
  if (pct > 0.01) {
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,255,255,0.8)';
    ctx.shadowBlur = 12;
    ctx.fillRect(W * pct - 2, H - 4, 2, 4);
    ctx.restore();
  }
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
