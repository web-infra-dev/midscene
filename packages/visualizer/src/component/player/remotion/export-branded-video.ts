import { mouseLoading, mousePointer } from '../../../utils';
import { LogoUrl } from '../../logo';
import { deriveFrameState } from './derive-frame-state';
import type { InsightOverlay } from './derive-frame-state';
import type { FrameMap } from './frame-calculator';
import {
  ANDROID_BORDER_RADIUS,
  ANDROID_NAV_BAR_H,
  ANDROID_STATUS_BAR_H,
  CHROME_BORDER_RADIUS,
  CHROME_DOTS,
  CHROME_TITLE_BAR_H,
  CYBER_CYAN,
  CYBER_MAGENTA,
  DESKTOP_APP_TITLE_BAR_H,
  IPHONE_BORDER_RADIUS,
  IPHONE_HOME_INDICATOR_H,
  IPHONE_STATUS_BAR_H,
  getBrowser3DTransform,
  getCursorTrail,
  getCyberParticleColor,
  getDataStream,
  getDeviceLayout,
  getGlitchSlices,
  getGridLines,
  getImageBlur,
  getLogoBreathing,
  getNeonFlicker,
  getParticleState,
  getParticles,
  getRippleState,
  getScanlineOffset,
  getVerticalGridLines,
  resolveShellType,
} from './visual-effects';

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

// ── cyberpunk background ──

function drawCyberBackground(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H * 1.2, 0, W / 2, H / 2, W);
  g.addColorStop(0, '#0a0a2e');
  g.addColorStop(0.5, '#050510');
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawCyberGrid(ctx: CanvasRenderingContext2D, frame: number) {
  const gridH = getGridLines(frame);
  const gridV = getVerticalGridLines();
  ctx.save();
  ctx.globalAlpha = 0.5;
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

function drawScanlines(
  ctx: CanvasRenderingContext2D,
  frame: number,
  alpha = 0.08,
) {
  const offset = getScanlineOffset(frame);
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  for (let y = offset; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

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

function drawTitleBarBase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
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
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#2a2a35');
  g.addColorStop(1, '#1e1e28');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.stroke();
  for (const dot of CHROME_DOTS) {
    ctx.beginPath();
    ctx.arc(x + dot.x, y + h / 2, 5, 0, Math.PI * 2);
    ctx.fillStyle = dot.color;
    ctx.fill();
  }
}

function drawChromeTitleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  const h = CHROME_TITLE_BAR_H;
  drawTitleBarBase(ctx, x, y, w, h);
  const abx = x + 70,
    aby = y + h / 2 - 11,
    abw = w - 84;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, abx, aby, abw, 22, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  roundRect(ctx, abx, aby, abw, 22, 6);
  ctx.stroke();
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,255,255,0.4)';
  ctx.fillText('https://', abx + 10, y + h / 2);
  const protoW = ctx.measureText('https://').width;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('app.example.com', abx + 10 + protoW, y + h / 2);
}

function drawDesktopAppTitleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  const h = DESKTOP_APP_TITLE_BAR_H;
  drawTitleBarBase(ctx, x, y, w, h);
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('Desktop Application', x + w / 2, y + h / 2);
}

function drawIPhoneStatusBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  const h = IPHONE_STATUS_BAR_H;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  // Time
  ctx.font = '600 14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('9:41', x + 20, y + h / 2);
  // Dynamic Island
  ctx.fillStyle = '#000';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + w / 2 - 60, y + h / 2 - 17, 120, 34, 17);
  ctx.fill();
  ctx.stroke();
  // Battery
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  const batX = x + w - 42;
  const batY = y + h / 2 - 5.5;
  roundRect(ctx, batX, batY, 22, 11, 3);
  ctx.stroke();
  ctx.fillStyle = '#34c759';
  ctx.fillRect(batX + 2, batY + 2, 15, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(batX + 22.5, batY + 3, 2, 5);
  ctx.restore();
}

function drawIPhoneHomeIndicator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  const h = IPHONE_HOME_INDICATOR_H;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  roundRect(ctx, x + w / 2 - 67, y + h - 13, 134, 5, 3);
  ctx.fill();
  ctx.restore();
}

function drawAndroidStatusBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  const h = ANDROID_STATUS_BAR_H;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  // Time
  ctx.font = '12px Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText('12:00', x + 16, y + h / 2);
  // Punch hole camera
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Battery
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  const batX = x + w - 38;
  const batY = y + h / 2 - 5;
  roundRect(ctx, batX, batY, 20, 10, 2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillRect(batX + 2, batY + 2, 12, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(batX + 20.5, batY + 3, 2, 4);
  ctx.restore();
}

function drawAndroidNavBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  const h = ANDROID_NAV_BAR_H;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  const cy = y + h / 2;
  const cx = x + w / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  // Back triangle
  ctx.beginPath();
  ctx.moveTo(cx - 48 + 5.5, cy - 6);
  ctx.lineTo(cx - 48 - 0.5, cy);
  ctx.lineTo(cx - 48 + 5.5, cy + 6);
  ctx.stroke();
  // Home circle
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.stroke();
  // Recent square
  roundRect(ctx, cx + 48 - 5, cy - 5, 10, 10, 1.5);
  ctx.stroke();
  ctx.restore();
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

// ── scene renderers ──

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
    ctx.shadowColor = `rgba(0,255,255,${breathing.glowIntensity})`;
    ctx.shadowBlur = breathing.glowRadius;
    ctx.drawImage(logo, -60, -80, 120, 120);
    ctx.shadowColor = `rgba(255,0,255,${breathing.glowIntensity * 0.4})`;
    ctx.shadowBlur = breathing.glowRadius * 2;
    ctx.drawImage(logo, -60, -80, 120, 120);
    ctx.restore();
  }
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,255,255,0.8)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#fff';
  ctx.fillText('Midscene', 0, 80);
  ctx.shadowBlur = 0;
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
  ctx.font = '500 20px monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,255,255,0.6)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('Powered by Midscene', 0, 48);
  ctx.shadowBlur = 0;
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
  frameMap: FrameMap,
  imgCache: Map<string, HTMLImageElement>,
  cursorImg: HTMLImageElement | null,
  spinnerImg: HTMLImageElement | null,
  effectsMode: boolean,
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
    scriptIndex,
    spinning,
    spinningElapsedMs,
    insights,
  } = st;

  // Linear interpolation — matches original pixi.js cubicMouse/cubicImage
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

  const shellType = resolveShellType(frameMap.deviceType);
  const deviceLayout = getDeviceLayout(shellType);
  const DEVICE_MARGIN = effectsMode ? deviceLayout.margin : 0;
  const browserW = effectsMode ? W - DEVICE_MARGIN * 2 : W;
  const contentH = effectsMode
    ? H - DEVICE_MARGIN * 2 - deviceLayout.topInset - deviceLayout.bottomInset
    : H;
  const browserH = effectsMode
    ? contentH + deviceLayout.topInset + deviceLayout.bottomInset
    : H;
  const bx = effectsMode ? DEVICE_MARGIN : 0;
  const by = effectsMode ? DEVICE_MARGIN : 0;

  const zoom = imgW / camW;
  const tx = -camL * (browserW / imgW);
  const ty = -camT2 * (contentH / imgH);

  const initAlpha = clamp(stepsFrame / 8, 0, 1);
  const crossAlpha = imageChanged
    ? clamp(fInScript / CROSSFADE_FRAMES, 0, 1)
    : 1;
  const blurPx = effectsMode ? getImageBlur(fInScript, imageChanged) : 0;

  const isFirstStep = scriptIndex === 0;
  const transform3d =
    effectsMode && isFirstStep
      ? getBrowser3DTransform(fInScript, stepsFrame)
      : { rotateX: 0, rotateY: 0, translateZ: 0, scale: 1 };

  // Background
  ctx.fillStyle = effectsMode ? '#0a0a12' : '#f4f4f4';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = initAlpha;

  if (effectsMode) {
    const centerX = bx + browserW / 2;
    const centerY = by + browserH / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(transform3d.scale, transform3d.scale);
    ctx.translate(-centerX, -centerY);

    // Device shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle =
      shellType === 'desktop-browser' || shellType === 'desktop-app'
        ? '#1e1e28'
        : '#000';
    roundRect(ctx, bx, by, browserW, browserH, deviceLayout.borderRadius);
    ctx.fill();
    ctx.restore();

    // Device top bar
    switch (shellType) {
      case 'iphone':
        drawIPhoneStatusBar(ctx, bx, by, browserW);
        break;
      case 'android':
        drawAndroidStatusBar(ctx, bx, by, browserW);
        break;
      case 'desktop-app':
        drawDesktopAppTitleBar(ctx, bx, by, browserW);
        break;
      default:
        drawChromeTitleBar(ctx, bx, by, browserW);
        break;
    }
  }

  const contentY = by + (effectsMode ? deviceLayout.topInset : 0);

  ctx.save();
  if (effectsMode) {
    const br = deviceLayout.borderRadius;
    ctx.beginPath();
    ctx.moveTo(bx, contentY);
    ctx.lineTo(bx + browserW, contentY);
    ctx.lineTo(bx + browserW, contentY + contentH - br);
    ctx.quadraticCurveTo(
      bx + browserW,
      contentY + contentH,
      bx + browserW - br,
      contentY + contentH,
    );
    ctx.lineTo(bx + br, contentY + contentH);
    ctx.quadraticCurveTo(bx, contentY + contentH, bx, contentY + contentH - br);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(bx, contentY, browserW, contentH);
  }

  // Draw screenshot
  const drawImg = (src: string, alpha: number, applyBlur = false) => {
    const imgEl = imgCache.get(src);
    if (!imgEl || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * alpha;
    if (applyBlur && blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
    ctx.beginPath();
    ctx.rect(bx, contentY, browserW, contentH);
    ctx.clip();
    ctx.translate(bx + tx * zoom, contentY + ty * zoom);
    ctx.scale(zoom, zoom);
    ctx.drawImage(imgEl, 0, 0, browserW, contentH);
    ctx.restore();
  };

  if (imageChanged && prevImg && crossAlpha < 1) {
    drawImg(prevImg, 1 - crossAlpha);
  }
  drawImg(img, imageChanged ? crossAlpha : 1, true);

  // Insight overlays
  if (insights.length > 0) {
    drawInsightOverlays(ctx, insights, { zoom, tx, ty }, bx, contentY);
  }

  // Effects-only: glitch, trail, ripple, scanlines
  if (effectsMode) {
    if (imageChanged) {
      const glitchSlices = getGlitchSlices(stepsFrame, stepsFrame - fInScript);
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
  }

  // Pointer screen position
  const camH = camW * (imgH / imgW);
  const sX = bx + ((ptrX - camL) / camW) * browserW;
  const sY = contentY + ((ptrY - camT2) / camH) * contentH;

  // Check if pointer has moved from center
  const hasPtrData =
    Math.abs(camera.pointerLeft - Math.round(baseW / 2)) > 1 ||
    Math.abs(camera.pointerTop - Math.round(baseH / 2)) > 1 ||
    Math.abs(prevCamera.pointerLeft - Math.round(baseW / 2)) > 1 ||
    Math.abs(prevCamera.pointerTop - Math.round(baseH / 2)) > 1;

  // Cursor trail (effects only)
  if (effectsMode && hasPtrData && pointerMoved) {
    const sf = scriptFrames[scriptIndex];
    const trailPositions: { x: number; y: number }[] = [];
    if (sf && sf.durationInFrames > 0) {
      for (let i = 0; i < 6; i++) {
        const pastLocal = fInScript - i;
        if (pastLocal < 0) break;
        const pastRaw = Math.min(pastLocal / sf.durationInFrames, 1);
        const pastPT = Math.min(pastRaw / POINTER_PHASE, 1);
        const pastPtrX = lerp(
          prevCamera.pointerLeft,
          camera.pointerLeft,
          pastPT,
        );
        const pastPtrY = lerp(prevCamera.pointerTop, camera.pointerTop, pastPT);
        const pastCT =
          pastRaw <= POINTER_PHASE
            ? 0
            : Math.min((pastRaw - POINTER_PHASE) / (1 - POINTER_PHASE), 1);
        const pastCamL = lerp(prevCamera.left, camera.left, pastCT);
        const pastCamT = lerp(prevCamera.top, camera.top, pastCT);
        const pastCamW = lerp(prevCamera.width, camera.width, pastCT);
        const pastCamH = pastCamW * (imgH / imgW);
        const tx2 = bx + ((pastPtrX - pastCamL) / pastCamW) * browserW;
        const ty2 = contentY + ((pastPtrY - pastCamT) / pastCamH) * contentH;
        trailPositions.push({ x: tx2, y: ty2 });
      }
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

  // Spinning pointer
  if (spinning && spinnerImg) {
    drawSpinningPointer(ctx, spinnerImg, sX, sY, st.spinningElapsedMs);
  }

  // Cursor — always show when pointer has moved from center
  if (!spinning && hasPtrData && cursorImg) {
    ctx.save();
    if (effectsMode) {
      ctx.shadowColor = 'rgba(0,255,255,0.6)';
      ctx.shadowBlur = 4;
    }
    ctx.drawImage(cursorImg, sX - 3, sY - 2, 22, 28);
    ctx.restore();
  }

  // Click ripple (effects only)
  if (effectsMode && pointerMoved) {
    const pointerArrivalFrame = Math.floor(fInScript * POINTER_PHASE);
    const framesAfterArrival = fInScript - pointerArrivalFrame;
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

  // Scan lines (effects only)
  if (effectsMode) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    const scanOff = getScanlineOffset(stepsFrame);
    for (let y = contentY + scanOff; y < contentY + contentH; y += 4)
      ctx.fillRect(bx, y, browserW, 1);
    ctx.restore();
  }

  ctx.restore(); // end content clip

  if (effectsMode) {
    // Device bottom bar
    const bottomY = contentY + contentH;
    switch (shellType) {
      case 'iphone':
        drawIPhoneHomeIndicator(ctx, bx, bottomY, browserW);
        break;
      case 'android':
        drawAndroidNavBar(ctx, bx, bottomY, browserW);
        break;
      default:
        break;
    }

    // Neon edge glow
    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,255,0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, browserW, browserH, deviceLayout.borderRadius);
    ctx.stroke();
    ctx.restore();

    // Badge
    const bScale = clamp((fInScript - 5) / 10, 0, 1);
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
      ctx.fillText(String(scriptIndex + 1), 0, 0);
      ctx.restore();
    }

    drawHudCorners(ctx, 0.3, 8, 16);
  }

  ctx.restore();
}

function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  f: number,
  total: number,
) {
  const pct = f / total;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, H - 4, W, 4);
  ctx.save();
  ctx.shadowColor = 'rgba(0,255,255,0.5)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#0ff';
  ctx.fillRect(0, H - 4, W * pct, 4);
  ctx.restore();
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

// ── main export function ──

export async function exportBrandedVideo(
  frameMap: FrameMap,
  effects: boolean,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const {
    totalDurationInFrames: total,
    fps,
    openingDurationInFrames: openDur,
    endingDurationInFrames: endDur,
  } = frameMap;

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

  let logoImg: HTMLImageElement | null = null;
  let cursorImg: HTMLImageElement | null = null;
  let spinnerImg: HTMLImageElement | null = null;
  try {
    logoImg = await loadImage(LogoUrl);
  } catch {
    /* optional */
  }
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
      a.download = effects ? 'midscene_branded.webm' : 'midscene_replay.webm';
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
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = effects ? '#000' : '#f4f4f4';
        ctx.fillRect(0, 0, W, H);

        if (effects && f < openDur) {
          drawOpening(ctx, f, openDur, logoImg);
        } else if (effects && f >= total - endDur) {
          drawEnding(ctx, f - (total - endDur), endDur, logoImg);
        } else {
          const stepsFrame = f - openDur;
          drawSteps(
            ctx,
            stepsFrame,
            frameMap,
            imgCache,
            cursorImg,
            spinnerImg,
            effects,
          );
        }

        if (effects) drawProgressBar(ctx, f, total);
        onProgress?.(f / total);
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
