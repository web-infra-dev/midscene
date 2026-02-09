import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { LogoUrl } from '../../logo';
import {
  CYBER_CYAN,
  CYBER_MAGENTA,
  getCyberParticleColor,
  getDataStream,
  getGridLines,
  getHudCorners,
  getLogoBreathing,
  getNeonFlicker,
  getNeonTextShadow,
  getParticleState,
  getParticles,
  getScanlineOffset,
  getVerticalGridLines,
} from './visual-effects';

const HudCornerBracket: React.FC<{
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
  opacity: number;
}> = ({ x, y, flipX, flipY, opacity }) => {
  const size = 20;
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
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
          backgroundColor: `rgba(0,255,255,0.6)`,
          transform: `scaleX(${sx})`,
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
          backgroundColor: `rgba(0,255,255,0.6)`,
          transform: `scaleY(${sy})`,
          transformOrigin: flipY ? 'bottom' : 'top',
        }}
      />
    </div>
  );
};

export const OpeningScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const scaleSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  });

  const opacity = interpolate(
    frame,
    [0, 20, durationInFrames - 20, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp' },
  );

  const translateY = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames],
    [0, -60],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const breathing = getLogoBreathing(frame);
  const particles = getParticles();
  const flicker = getNeonFlicker(frame);
  const scanOffset = getScanlineOffset(frame);
  const gridH = getGridLines(frame);
  const gridV = getVerticalGridLines();
  const hudCorners = getHudCorners(width, height);
  const dataStream = getDataStream(frame, 32);

  const hudOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse at 50% 120%, #0a0a2e 0%, #050510 50%, #000000 100%)',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Perspective grid floor */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      >
        {/* Horizontal lines */}
        {gridH.map((line, i) => (
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
        {/* Vertical lines */}
        {gridV.map((line, i) => (
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

      {/* Neon particles */}
      {particles.map((p, i) => {
        const s = getParticleState(p, frame);
        const color = getCyberParticleColor(i);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${s.x * 100}%`,
              top: `${s.y * 100}%`,
              width: s.size * 1.5,
              height: s.size * 1.5,
              borderRadius: '50%',
              backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, ${s.alpha})`,
              boxShadow: `0 0 ${s.size * 3}px rgba(${color.r}, ${color.g}, ${color.b}, ${s.alpha * 0.6})`,
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* Main content */}
      <div
        style={{
          opacity: opacity * flicker,
          transform: `scale(${scaleSpring * breathing.scale}) translateY(${translateY}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <Img
          src={LogoUrl}
          style={{
            height: 120,
            objectFit: 'contain',
            borderRadius: 24,
            filter: [
              `drop-shadow(0 0 ${breathing.glowRadius}px rgba(0,255,255,${breathing.glowIntensity}))`,
              `drop-shadow(0 0 ${breathing.glowRadius * 2}px rgba(255,0,255,${breathing.glowIntensity * 0.4}))`,
            ].join(' '),
          }}
        />
        <div
          style={{
            color: '#fff',
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: 4,
            textShadow: getNeonTextShadow(CYBER_CYAN, flicker),
            fontFamily: 'monospace, sans-serif',
          }}
        >
          Midscene
        </div>
        {/* Chromatic aberration subtitle */}
        <div style={{ position: 'relative', height: 20 }}>
          <span
            style={{
              position: 'absolute',
              left: -1,
              color: `rgba(${CYBER_CYAN.r},${CYBER_CYAN.g},${CYBER_CYAN.b},0.5)`,
              fontSize: 14,
              fontFamily: 'monospace',
              letterSpacing: 6,
              whiteSpace: 'nowrap',
            }}
          >
            AI-POWERED AUTOMATION
          </span>
          <span
            style={{
              position: 'absolute',
              left: 1,
              color: `rgba(${CYBER_MAGENTA.r},${CYBER_MAGENTA.g},${CYBER_MAGENTA.b},0.5)`,
              fontSize: 14,
              fontFamily: 'monospace',
              letterSpacing: 6,
              whiteSpace: 'nowrap',
            }}
          >
            AI-POWERED AUTOMATION
          </span>
          <span
            style={{
              position: 'relative',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 14,
              fontFamily: 'monospace',
              letterSpacing: 6,
              whiteSpace: 'nowrap',
            }}
          >
            AI-POWERED AUTOMATION
          </span>
        </div>
      </div>

      {/* HUD corner brackets */}
      {hudCorners.map((c, i) => (
        <HudCornerBracket key={i} {...c} opacity={hudOpacity} />
      ))}

      {/* Data stream at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          color: `rgba(0,255,255,0.25)`,
          fontSize: 10,
          fontFamily: 'monospace',
          letterSpacing: 2,
          opacity: hudOpacity,
          pointerEvents: 'none',
        }}
      >
        {dataStream.chars}
      </div>

      {/* Scan lines overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 3px,
            rgba(0, 0, 0, 0.08) 3px,
            rgba(0, 0, 0, 0.08) 4px
          )`,
          backgroundPositionY: scanOffset,
          pointerEvents: 'none',
        }}
      />

      {/* Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
