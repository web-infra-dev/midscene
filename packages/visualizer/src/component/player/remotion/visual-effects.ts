/**
 * Pure computation functions for visual effects.
 * No React/Canvas dependencies — shared by Remotion preview and Canvas export.
 */

// ── Deterministic PRNG ──────────────────────────────────────

/** Mulberry32 — deterministic 32-bit PRNG */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Particles ───────────────────────────────────────────────

export interface Particle {
  x: number; // 0-1 normalised
  y: number;
  size: number; // 1-4 px
  baseAlpha: number; // 0.1-0.6
  speed: number; // drift speed multiplier
  phase: number; // breathing phase offset
}

const PARTICLE_COUNT = 40;
const PARTICLE_SEED = 42;

let _particles: Particle[] | null = null;

export function getParticles(): Particle[] {
  if (_particles) return _particles;
  const rand = mulberry32(PARTICLE_SEED);
  _particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: rand(),
    y: rand(),
    size: 1 + rand() * 3,
    baseAlpha: 0.1 + rand() * 0.5,
    speed: 0.3 + rand() * 0.7,
    phase: rand() * Math.PI * 2,
  }));
  return _particles;
}

export interface ParticleState {
  x: number; // 0-1
  y: number; // 0-1
  size: number;
  alpha: number;
}

/** Get particle position & opacity at a given frame (30fps assumed) */
export function getParticleState(p: Particle, frame: number): ParticleState {
  const breathPeriod = 120; // ~4s at 30fps
  const breathPhase =
    ((frame / breathPeriod) * Math.PI * 2 + p.phase) % (Math.PI * 2);
  const breathAlpha = 0.6 + 0.4 * Math.sin(breathPhase); // 0.2-1.0 multiplier

  const driftX = Math.sin(frame * 0.008 * p.speed + p.phase) * 0.03;
  const driftY = Math.cos(frame * 0.006 * p.speed + p.phase * 1.3) * 0.02;

  return {
    x: (((p.x + driftX) % 1) + 1) % 1,
    y: (((p.y + driftY) % 1) + 1) % 1,
    size: p.size,
    alpha: p.baseAlpha * breathAlpha,
  };
}

// ── Logo breathing glow ─────────────────────────────────────

export interface LogoBreathing {
  scale: number;
  glowIntensity: number; // 0-1
  glowRadius: number; // px
}

/** Breathing cycle ~2.5s (75 frames at 30fps) */
export function getLogoBreathing(frame: number): LogoBreathing {
  const period = 75;
  const t = Math.sin((frame / period) * Math.PI * 2);
  return {
    scale: 1.0 + 0.02 * (t * 0.5 + 0.5), // 1.0 ↔ 1.02
    glowIntensity: 0.3 + 0.4 * (t * 0.5 + 0.5), // 0.3 ↔ 0.7
    glowRadius: 8 + 12 * (t * 0.5 + 0.5), // 8 ↔ 20 px
  };
}

// ── Click ripple ────────────────────────────────────────────

export interface RippleState {
  radius: number;
  opacity: number;
  active: boolean;
}

/** Ripple expanding from 6→36px, opacity 0.5→0, over 18 frames */
export function getRippleState(framesAfterArrival: number): RippleState {
  if (framesAfterArrival < 0 || framesAfterArrival > 18) {
    return { radius: 0, opacity: 0, active: false };
  }
  const t = framesAfterArrival / 18;
  return {
    radius: 6 + 30 * t,
    opacity: 0.5 * (1 - t),
    active: true,
  };
}

// ── Cursor trail ────────────────────────────────────────────

export interface TrailPoint {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

/** 6 trailing dots, size 8→3px, alpha fading */
export function getCursorTrail(
  positionHistory: { x: number; y: number }[],
): TrailPoint[] {
  const count = Math.min(positionHistory.length, 6);
  const points: TrailPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / 5; // 0→1
    points.push({
      x: positionHistory[i].x,
      y: positionHistory[i].y,
      size: 8 - 5 * t, // 8→3
      alpha: 0.4 * (1 - t * 0.8), // 0.4→0.08
    });
  }
  return points;
}

// ── Typewriter title ────────────────────────────────────────

/** Returns visible portion of title using Array.from for CJK/emoji support */
export function getTypewriterChars(
  title: string,
  frameInStep: number,
  startFrame: number,
  charsPerFrame: number,
): { text: string; showCursor: boolean; done: boolean } {
  const elapsed = frameInStep - startFrame;
  if (elapsed < 0) return { text: '', showCursor: false, done: false };

  const chars = Array.from(title);
  const visibleCount = Math.min(
    Math.floor(elapsed * charsPerFrame),
    chars.length,
  );
  const done = visibleCount >= chars.length;
  const showCursor = !done && Math.floor(frameInStep / 4) % 2 === 0;

  return {
    text: chars.slice(0, visibleCount).join(''),
    showCursor,
    done,
  };
}

// ── Image blur transition ───────────────────────────────────

/** Blur 4→0px over 8 frames when image changes */
export function getImageBlur(
  framesIntoKeyframe: number,
  imageChanged: boolean,
): number {
  if (!imageChanged) return 0;
  if (framesIntoKeyframe >= 8) return 0;
  if (framesIntoKeyframe < 0) return 4;
  return 4 * (1 - framesIntoKeyframe / 8);
}

// ══════════════════════════════════════════════════════════════
// ██  CYBERPUNK EFFECTS  ██
// ══════════════════════════════════════════════════════════════

// Neon palette
export const CYBER_CYAN = { r: 0, g: 255, b: 255 };
export const CYBER_MAGENTA = { r: 255, g: 0, b: 255 };
export const CYBER_PINK = { r: 255, g: 20, b: 147 };
export const CYBER_BLUE = { r: 0, g: 212, b: 255 };

// ── Neon particle colors ────────────────────────────────────

/** Deterministic cyber color per particle index */
export function getCyberParticleColor(index: number): {
  r: number;
  g: number;
  b: number;
} {
  const palette = [CYBER_CYAN, CYBER_MAGENTA, CYBER_BLUE, CYBER_PINK];
  // Most are cyan, some magenta/pink for accent
  const weights = [0.45, 0.25, 0.2, 0.1];
  const rand = mulberry32(index * 7 + 13);
  const v = rand();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (v < cumulative) return palette[i];
  }
  return CYBER_CYAN;
}

// ── Scan lines ──────────────────────────────────────────────

export interface ScanlineConfig {
  spacing: number; // px between lines
  thickness: number; // line thickness px
  alpha: number; // base opacity
  scrollSpeed: number; // px per frame
}

const DEFAULT_SCANLINE: ScanlineConfig = {
  spacing: 4,
  thickness: 1,
  alpha: 0.08,
  scrollSpeed: 0.5,
};

/** Get the Y-offset for scrolling scan lines */
export function getScanlineOffset(
  frame: number,
  config = DEFAULT_SCANLINE,
): number {
  return (frame * config.scrollSpeed) % config.spacing;
}

// ── Perspective grid ────────────────────────────────────────

export interface GridLine {
  y: number; // 0-1 normalised screen position
  alpha: number; // fades near horizon
}

/** Horizontal grid lines for perspective floor, scrolling upward */
export function getGridLines(frame: number): GridLine[] {
  const lines: GridLine[] = [];
  const count = 20;
  const scrollOffset = (frame * 0.008) % 1;
  for (let i = 0; i < count; i++) {
    // Perspective: lines bunch up near horizon (top of grid area)
    const t = (i / count + scrollOffset) % 1;
    const y = 0.45 + 0.55 * (t * t); // quadratic → bunched at top
    const alpha = 0.15 + 0.35 * t; // brighter near bottom
    lines.push({ y, alpha });
  }
  return lines;
}

/** Vertical grid lines (static, perspective converging) */
export function getVerticalGridLines(): { x: number; alpha: number }[] {
  const lines: { x: number; alpha: number }[] = [];
  const count = 16;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = t;
    const alpha = 0.1 + 0.15 * (1 - Math.abs(t - 0.5) * 2); // brighter at center
    lines.push({ x, alpha });
  }
  return lines;
}

// ── Glitch slices ───────────────────────────────────────────

export interface GlitchSlice {
  y: number; // 0-1 normalised
  height: number; // 0-1 normalised
  offsetX: number; // px displacement
  rgbSplit: number; // px for chromatic aberration
}

/** Generate glitch slices — active for ~6 frames at transitions */
export function getGlitchSlices(
  frame: number,
  transitionFrame: number,
): GlitchSlice[] {
  const elapsed = frame - transitionFrame;
  if (elapsed < 0 || elapsed > 6) return [];

  const intensity = 1 - elapsed / 6; // fades out
  const rand = mulberry32(transitionFrame * 31 + elapsed * 7);
  const sliceCount = 2 + Math.floor(rand() * 3);
  const slices: GlitchSlice[] = [];

  for (let i = 0; i < sliceCount; i++) {
    slices.push({
      y: rand(),
      height: 0.02 + rand() * 0.06,
      offsetX: (rand() - 0.5) * 30 * intensity,
      rgbSplit: (1 + rand() * 4) * intensity,
    });
  }
  return slices;
}

// ── Chromatic aberration ────────────────────────────────────

/** Subtle chromatic offset that pulses */
export function getChromaticOffset(frame: number): number {
  const base = 0.5;
  const pulse = Math.sin(frame * 0.15) * 0.5;
  return base + pulse;
}

// ── HUD corners ─────────────────────────────────────────────

export interface HudCorner {
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
}

/** 4 corner bracket positions, inset by margin */
export function getHudCorners(
  width: number,
  height: number,
  margin = 12,
): HudCorner[] {
  return [
    { x: margin, y: margin, flipX: false, flipY: false },
    { x: width - margin, y: margin, flipX: true, flipY: false },
    { x: margin, y: height - margin, flipX: false, flipY: true },
    { x: width - margin, y: height - margin, flipX: true, flipY: true },
  ];
}

// ── Neon glow text style ────────────────────────────────────

/** Multi-layer text-shadow for neon sign effect */
export function getNeonTextShadow(
  color: { r: number; g: number; b: number },
  intensity = 1,
): string {
  const c = `${color.r},${color.g},${color.b}`;
  return [
    `0 0 ${4 * intensity}px rgba(${c},0.8)`,
    `0 0 ${8 * intensity}px rgba(${c},0.6)`,
    `0 0 ${16 * intensity}px rgba(${c},0.4)`,
    `0 0 ${32 * intensity}px rgba(${c},0.2)`,
  ].join(', ');
}

// ── Flicker effect ──────────────────────────────────────────

/** Neon flicker — subtle random brightness variation */
export function getNeonFlicker(frame: number): number {
  const rand = mulberry32(frame * 3);
  const v = rand();
  // Mostly stable, occasional dip
  if (v > 0.92) return 0.7 + rand() * 0.2;
  return 0.95 + rand() * 0.05;
}

// ── Hex grid data line ──────────────────────────────────────

/** Scrolling "data stream" hex characters */
export function getDataStream(
  frame: number,
  length: number,
): { chars: string; offset: number } {
  const rand = mulberry32(Math.floor(frame / 3));
  const hexChars = '0123456789ABCDEF';
  let chars = '';
  for (let i = 0; i < length; i++) {
    chars += hexChars[Math.floor(rand() * 16)];
    if (i % 4 === 3 && i < length - 1) chars += ' ';
  }
  return { chars, offset: (frame * 2) % 100 };
}

// ── Chrome browser shell ────────────────────────────────────

export const CHROME_TITLE_BAR_H = 36;
export const CHROME_BORDER_RADIUS = 10;

// Traffic light dot colors
export const CHROME_DOTS = [
  { color: '#FF5F57', x: 14 },
  { color: '#FFBD2E', x: 30 },
  { color: '#28CA41', x: 46 },
] as const;

// ── Browser 3D transform ────────────────────────────────────

export interface Browser3D {
  rotateX: number; // degrees
  rotateY: number; // degrees
  translateZ: number; // px
  scale: number;
}

/**
 * 3D perspective animation for the browser shell.
 * - Entry: fly in from tilted angle, scale up
 * - Idle: gentle floating sway
 * - Step change: subtle bounce
 */
export function getBrowser3DTransform(
  frameInStep: number,
  frame: number,
): Browser3D {
  // Entry animation: first 20 frames, fly in from tilted
  const entryT = Math.min(frameInStep / 20, 1);
  const entryEase = 1 - (1 - entryT) * (1 - entryT); // ease-out quad

  // Start tilted, end at idle position
  const entryRotateX = 12 * (1 - entryEase); // 12° → ~0°
  const entryRotateY = -8 * (1 - entryEase); // -8° → ~0°
  const entryScale = 0.85 + 0.15 * entryEase; // 0.85 → 1.0
  const entryZ = -80 * (1 - entryEase); // -80 → 0

  // Idle floating: gentle sinusoidal sway
  const swayX = Math.sin(frame * 0.03) * 1.5; // ±1.5° on X
  const swayY = Math.cos(frame * 0.025) * 1.0; // ±1.0° on Y
  const swayZ = Math.sin(frame * 0.02) * 5; // ±5px depth wobble

  return {
    rotateX: entryRotateX + swayX,
    rotateY: entryRotateY + swayY,
    translateZ: entryZ + swayZ,
    scale: entryScale,
  };
}
