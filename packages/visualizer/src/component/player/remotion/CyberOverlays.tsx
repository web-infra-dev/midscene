/**
 * Shared cyberpunk visual overlay components used by OpeningScene, EndingScene, and StepScene.
 */

import type React from 'react';
import type { HudCorner } from './visual-effects';

// ── HUD Corner Bracket ──

interface HudCornerBracketProps {
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
  size?: number;
}

export function HudCornerBracket({
  x,
  y,
  flipX,
  flipY,
  opacity,
  size = 20,
}: HudCornerBracketProps): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        left: x - (flipX ? size : 0),
        top: y - (flipY ? size : 0),
        width: size,
        height: size,
        opacity,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: 2,
          backgroundColor: 'rgba(0,255,255,0.6)',
          transform: `scaleX(${flipX ? -1 : 1})`,
          transformOrigin: flipX ? 'right' : 'left',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 2,
          height: size,
          backgroundColor: 'rgba(0,255,255,0.6)',
          transform: `scaleY(${flipY ? -1 : 1})`,
          transformOrigin: flipY ? 'bottom' : 'top',
        }}
      />
    </div>
  );
}

// ── HUD Corners list ──

export function HudCorners({
  corners,
  opacity,
  size,
}: {
  corners: HudCorner[];
  opacity: number;
  size?: number;
}): React.ReactElement {
  return (
    <>
      {corners.map((c, i) => (
        <HudCornerBracket key={i} {...c} opacity={opacity} size={size} />
      ))}
    </>
  );
}

// ── Perspective Grid Floor ──

interface GridLine {
  y: number;
  alpha: number;
}

interface VerticalGridLine {
  x: number;
  alpha: number;
}

export function PerspectiveGrid({
  horizontalLines,
  verticalLines,
  opacity = 0.6,
}: {
  horizontalLines: GridLine[];
  verticalLines: VerticalGridLine[];
  opacity?: number;
}): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        pointerEvents: 'none',
      }}
    >
      {horizontalLines.map((line, i) => (
        <div
          key={`h${i}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${line.y * 100}%`,
            height: 1,
            backgroundColor: `rgba(0, 255, 255, ${line.alpha * 0.4})`,
            boxShadow: `0 0 4px rgba(0, 255, 255, ${line.alpha * 0.3})`,
          }}
        />
      ))}
      {verticalLines.map((line, i) => (
        <div
          key={`v${i}`}
          style={{
            position: 'absolute',
            top: '45%',
            bottom: 0,
            left: `${line.x * 100}%`,
            width: 1,
            backgroundColor: `rgba(0, 255, 255, ${line.alpha * 0.3})`,
            boxShadow: `0 0 3px rgba(0, 255, 255, ${line.alpha * 0.2})`,
          }}
        />
      ))}
    </div>
  );
}

// ── Neon Particles ──

interface ParticleRenderState {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

interface ParticleColor {
  r: number;
  g: number;
  b: number;
}

export function NeonParticles({
  particles,
}: {
  particles: { state: ParticleRenderState; color: ParticleColor }[];
}): React.ReactElement {
  return (
    <>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.state.x * 100}%`,
            top: `${p.state.y * 100}%`,
            width: p.state.size * 1.5,
            height: p.state.size * 1.5,
            borderRadius: '50%',
            backgroundColor: `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${p.state.alpha})`,
            boxShadow: `0 0 ${p.state.size * 3}px rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${p.state.alpha * 0.6})`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  );
}

// ── Scanline Overlay ──

export function ScanlineOverlay({
  offset,
}: {
  offset: number;
}): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0, 0, 0, 0.08) 3px, rgba(0, 0, 0, 0.08) 4px)',
        backgroundPositionY: offset,
        pointerEvents: 'none',
      }}
    />
  );
}

// ── Vignette Overlay ──

export function VignetteOverlay(): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
        pointerEvents: 'none',
      }}
    />
  );
}

// ── Chromatic Aberration Text ──

interface ChromaticTextProps {
  text: string;
  fontSize: number;
  cyanColor: { r: number; g: number; b: number };
  magentaColor: { r: number; g: number; b: number };
  baseColor?: string;
  cyanAlpha?: number;
  magentaAlpha?: number;
  letterSpacing?: number;
  fontFamily?: string;
  height?: number;
  whiteSpace?: string;
}

export function ChromaticText({
  text,
  fontSize,
  cyanColor,
  magentaColor,
  baseColor = 'rgba(255,255,255,0.8)',
  cyanAlpha = 0.5,
  magentaAlpha = 0.5,
  letterSpacing = 6,
  fontFamily = 'monospace',
  height,
  whiteSpace = 'nowrap',
}: ChromaticTextProps): React.ReactElement {
  const sharedStyle: React.CSSProperties = {
    fontSize,
    fontFamily,
    letterSpacing,
    whiteSpace: whiteSpace as React.CSSProperties['whiteSpace'],
  };

  return (
    <div style={{ position: 'relative', height: height ?? fontSize * 1.4 }}>
      <span
        style={{
          ...sharedStyle,
          position: 'absolute',
          left: -1,
          color: `rgba(${cyanColor.r},${cyanColor.g},${cyanColor.b},${cyanAlpha})`,
        }}
      >
        {text}
      </span>
      <span
        style={{
          ...sharedStyle,
          position: 'absolute',
          left: 1,
          color: `rgba(${magentaColor.r},${magentaColor.g},${magentaColor.b},${magentaAlpha})`,
        }}
      >
        {text}
      </span>
      <span
        style={{
          ...sharedStyle,
          position: 'relative',
          color: baseColor,
        }}
      >
        {text}
      </span>
    </div>
  );
}

// ── Status bar icon components ──

export function SignalBarsIcon({
  barWidth = 3,
  gap = 1,
}: { barWidth?: number; gap?: number } = {}): React.ReactElement {
  const w = barWidth * 4 + gap * 3;
  return (
    <svg width={w} height="12" viewBox={`0 0 ${w} 12`}>
      <rect x="0" y="8" width={barWidth} height="4" rx="0.5" fill="#fff" />
      <rect
        x={barWidth + gap}
        y="5"
        width={barWidth}
        height="7"
        rx="0.5"
        fill="#fff"
      />
      <rect
        x={(barWidth + gap) * 2}
        y="2"
        width={barWidth}
        height="10"
        rx="0.5"
        fill="#fff"
      />
      <rect
        x={(barWidth + gap) * 3}
        y="0"
        width={barWidth}
        height="12"
        rx="0.5"
        fill="#fff"
      />
    </svg>
  );
}

export function WifiIcon(): React.ReactElement {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12">
      <path
        d="M7 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM3.5 8.5C4.5 7.2 5.7 6.5 7 6.5s2.5.7 3.5 2"
        stroke="#fff"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M1 5.5C2.8 3.2 4.8 2 7 2s4.2 1.2 6 3.5"
        stroke="#fff"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BatteryIcon({
  width: bw = 22,
  height: bh = 11,
  fillPercent = 80,
  fillColor = '#34c759',
  borderRadius = 3,
}: {
  width?: number;
  height?: number;
  fillPercent?: number;
  fillColor?: string;
  borderRadius?: number;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div
        style={{
          width: bw,
          height: bh,
          border: '1px solid rgba(255,255,255,0.5)',
          borderRadius,
          padding: 1,
        }}
      >
        <div
          style={{
            width: `${fillPercent}%`,
            height: '100%',
            backgroundColor: fillColor,
            borderRadius: borderRadius * 0.5,
          }}
        />
      </div>
      <div
        style={{
          width: 2,
          height: bh * 0.45,
          backgroundColor: 'rgba(255,255,255,0.5)',
          borderRadius: '0 1px 1px 0',
          marginLeft: 0.5,
        }}
      />
    </div>
  );
}

export function AndroidNavBar(): React.ReactElement {
  return (
    <>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <polygon
          points="11,2 5,8 11,14"
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.5"
        />
      </svg>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.5"
        />
      </svg>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <rect
          x="3"
          y="3"
          width="10"
          height="10"
          rx="1.5"
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.5"
        />
      </svg>
    </>
  );
}
