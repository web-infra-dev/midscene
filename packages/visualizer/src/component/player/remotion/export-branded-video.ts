import { mouseLoading, mousePointer } from '../../../utils';
import { LogoUrl } from '../../logo';
import type { FrameMap, ScriptFrame } from './frame-calculator';
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
  getVerticalGridLines,
} from './visual-effects';

const W = 960;
const H = 540;
const POINTER_PHASE = 0.375;
const CROSSFADE_FRAMES = 10;

// ── helpers ──

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

// ── State derivation from ScriptFrame timeline ──

interface CameraState {
  left: number;
  top: number;
  width: number;
  pointerLeft: number;
  pointerTop: number;
}

interface InsightOverlay {
  highlightRect?: {
    left: number;
    top: number;
    width: number;
    height: number;
    description?: string;
  };
  searchArea?: { left: number; top: number; width: number; height: number };
  alpha: number;
}

interface FrameState {
  img: string;
  prevImg: string | null;
  imageWidth: number;
  imageHeight: number;
  camera: CameraState;
  prevCamera: CameraState;
  pointerMoved: boolean;
  imageChanged: boolean;
  rawProgress: number;
  frameInScript: number;
  scriptIndex: number;
  title: string;
  subTitle: string;
  spinning: boolean;
  spinningElapsedMs: number;
  currentPointerImg: string;
  insights: InsightOverlay[];
}

function deriveFrameState(
  scriptFrames: ScriptFrame[],
  stepsFrame: number,
  baseW: number,
  baseH: number,
  fps: number,
): FrameState {
  const defaultCam: CameraState = {
    left: 0,
    top: 0,
    width: baseW,
    pointerLeft: Math.round(baseW / 2),
    pointerTop: Math.round(baseH / 2),
  };

  let curImg = '';
  let curIW = baseW;
  let curIH = baseH;
  let curCam = { ...defaultCam };
  let prevCam = { ...defaultCam };
  let prevImg: string | null = null;
  let insights: InsightOverlay[] = [];
  let spinning = false;
  let spinMs = 0;
  let ptrImg = mousePointer;
  let curTitle = '';
  let curSubTitle = '';
  let fInScript = 0;
  let sIdx = 0;
  let imgChanged = false;
  let pMoved = false;
  let rawProg = 0;

  for (let i = 0; i < scriptFrames.length; i++) {
    const sf = scriptFrames[i];
    const sfEnd = sf.startFrame + sf.durationInFrames;

    if (sf.durationInFrames === 0) {
      if (sf.startFrame <= stepsFrame) {
        if (sf.type === 'pointer' && sf.pointerImg) ptrImg = sf.pointerImg;
        curTitle = sf.title || curTitle;
        curSubTitle = sf.subTitle || curSubTitle;
        sIdx = i;
      }
      continue;
    }

    if (stepsFrame < sf.startFrame) break;

    curTitle = sf.title || curTitle;
    curSubTitle = sf.subTitle || curSubTitle;
    sIdx = i;
    fInScript = stepsFrame - sf.startFrame;
    rawProg = Math.min(fInScript / sf.durationInFrames, 1);

    switch (sf.type) {
      case 'img': {
        if (sf.img) {
          if (curImg && sf.img !== curImg) {
            prevImg = curImg;
            imgChanged = true;
          }
          curImg = sf.img;
          curIW = sf.imageWidth || baseW;
          curIH = sf.imageHeight || baseH;
        }
        if (sf.cameraTarget) {
          prevCam = { ...curCam };
          curCam = { ...sf.cameraTarget };
          pMoved =
            Math.abs(prevCam.pointerLeft - curCam.pointerLeft) > 1 ||
            Math.abs(prevCam.pointerTop - curCam.pointerTop) > 1;
        }
        spinning = false;
        break;
      }
      case 'insight': {
        if (sf.img) {
          if (curImg && sf.img !== curImg) {
            prevImg = curImg;
            imgChanged = true;
          }
          curImg = sf.img;
          curIW = sf.imageWidth || baseW;
          curIH = sf.imageHeight || baseH;
        }
        const already = insights.some(
          (ai) =>
            ai.highlightRect?.left === sf.highlightElement?.rect.left &&
            ai.searchArea?.left === sf.searchArea?.left,
        );
        if (!already) {
          insights.push({
            highlightRect: sf.highlightElement
              ? {
                  ...sf.highlightElement.rect,
                  description: sf.highlightElement.description,
                }
              : undefined,
            searchArea: sf.searchArea ? { ...sf.searchArea } : undefined,
            alpha: 1,
          });
        }
        if (sf.cameraTarget && sf.insightPhaseFrames !== undefined) {
          const cameraStart = sf.startFrame + sf.insightPhaseFrames;
          if (stepsFrame >= cameraStart) {
            prevCam = { ...curCam };
            curCam = { ...sf.cameraTarget };
            const cFIn = stepsFrame - cameraStart;
            const cDur = sf.cameraPhaseFrames || 1;
            rawProg = Math.min(cFIn / cDur, 1);
            pMoved =
              Math.abs(prevCam.pointerLeft - curCam.pointerLeft) > 1 ||
              Math.abs(prevCam.pointerTop - curCam.pointerTop) > 1;
          }
        }
        spinning = false;
        break;
      }
      case 'clear-insight': {
        const alpha = 1 - rawProg;
        insights = insights.map((ai) => ({ ...ai, alpha }));
        if (stepsFrame >= sfEnd) insights = [];
        spinning = false;
        break;
      }
      case 'spinning-pointer': {
        spinning = true;
        spinMs = (fInScript / fps) * 1000;
        break;
      }
      case 'sleep': {
        spinning = false;
        break;
      }
    }

    if (stepsFrame >= sfEnd) {
      if (sf.type !== 'clear-insight') imgChanged = false;
      pMoved = false;
      rawProg = 1;
      // Commit camera position so subsequent scripts without camera
      // don't interpolate back to a stale prevCam
      if (sf.cameraTarget) {
        prevCam = { ...curCam };
      }
    }
  }

  return {
    img: curImg,
    prevImg: imgChanged ? prevImg : null,
    imageWidth: curIW,
    imageHeight: curIH,
    camera: curCam,
    prevCamera: prevCam,
    pointerMoved: pMoved,
    imageChanged: imgChanged,
    rawProgress: rawProg,
    frameInScript: fInScript,
    scriptIndex: sIdx,
    title: curTitle,
    subTitle: curSubTitle,
    spinning,
    spinningElapsedMs: spinMs,
    currentPointerImg: ptrImg,
    insights,
  };
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

const BROWSER_MARGIN = 24;

function drawChromeTitleBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  const h = CHROME_TITLE_BAR_H;
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

// ── Insight overlay drawing ──

function drawInsightOverlays(
  ctx: CanvasRenderingContext2D,
  insights: InsightOverlay[],
  cameraTransform: { zoom: number; tx: number; ty: number },
  bx: number,
  contentY: number,
  browserW: number,
  contentH: number,
) {
  for (const insight of insights) {
    if (insight.alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha *= insight.alpha;

    if (insight.highlightRect) {
      const r = insight.highlightRect;
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

      if (r.description) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        const labelY = ry - 6;
        // AI badge
        ctx.font = 'bold 9px sans-serif';
        const badgeText = 'AI';
        const badgeW = ctx.measureText(badgeText).width + 8;
        const badgeH = 14;
        const badgeX = rx;
        const badgeY = labelY - badgeH;
        const bg = ctx.createLinearGradient(
          badgeX,
          badgeY,
          badgeX + badgeW,
          badgeY + badgeH,
        );
        bg.addColorStop(0, '#8b5cf6');
        bg.addColorStop(1, '#6366f1');
        ctx.fillStyle = bg;
        roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 3);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(badgeText, badgeX + 4, labelY - 1);
        // Description text
        ctx.font = '600 14px sans-serif';
        ctx.fillStyle = '#6d28d9';
        ctx.fillText(r.description, badgeX + badgeW + 4, labelY - 1);
      }
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

      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const saLabelY = ry - 6;
      // AI badge for search area
      ctx.font = 'bold 9px sans-serif';
      const saBadgeText = 'AI';
      const saBadgeW = ctx.measureText(saBadgeText).width + 8;
      const saBadgeH = 14;
      const saBadgeX = rx;
      const saBadgeY = saLabelY - saBadgeH;
      const saBg = ctx.createLinearGradient(
        saBadgeX,
        saBadgeY,
        saBadgeX + saBadgeW,
        saBadgeY + saBadgeH,
      );
      saBg.addColorStop(0, '#0891b2');
      saBg.addColorStop(1, '#028391');
      ctx.fillStyle = saBg;
      roundRect(ctx, saBadgeX, saBadgeY, saBadgeW, saBadgeH, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(saBadgeText, saBadgeX + 4, saLabelY - 1);
      // Search Area text
      ctx.font = '600 14px sans-serif';
      ctx.fillStyle = '#0e7490';
      ctx.fillText('Search Area', saBadgeX + saBadgeW + 4, saLabelY - 1);
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

  const browserW = effectsMode ? W - BROWSER_MARGIN * 2 : W;
  const contentH = effectsMode
    ? H - BROWSER_MARGIN * 2 - CHROME_TITLE_BAR_H
    : H;
  const browserH = contentH + (effectsMode ? CHROME_TITLE_BAR_H : 0);
  const bx = effectsMode ? BROWSER_MARGIN : 0;
  const by = effectsMode ? BROWSER_MARGIN : 0;

  const zoom = imgW / camW;
  const tx = -camL * (browserW / imgW);
  const ty = -camT2 * (contentH / imgH);

  const initAlpha = clamp(stepsFrame / 8, 0, 1);
  const crossAlpha = imageChanged
    ? clamp((stepsFrame - (stepsFrame - fInScript)) / CROSSFADE_FRAMES, 0, 1)
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

    // Browser shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#1e1e28';
    roundRect(ctx, bx, by, browserW, browserH, CHROME_BORDER_RADIUS);
    ctx.fill();
    ctx.restore();

    drawChromeTitleBar(ctx, bx, by, browserW);
  }

  const contentY = by + (effectsMode ? CHROME_TITLE_BAR_H : 0);

  ctx.save();
  if (effectsMode) {
    ctx.beginPath();
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
    drawInsightOverlays(
      ctx,
      insights,
      { zoom, tx, ty },
      bx,
      contentY,
      browserW,
      contentH,
    );
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
    const trailPositions: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const pastFrame = stepsFrame - i;
      if (pastFrame < 0) break;
      trailPositions.push({ x: sX, y: sY });
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
    // Neon edge glow
    ctx.save();
    ctx.strokeStyle = 'rgba(0,255,255,0.2)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, browserW, browserH, CHROME_BORDER_RADIUS);
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
