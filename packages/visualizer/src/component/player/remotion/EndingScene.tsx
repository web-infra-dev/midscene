import {
  AbsoluteFill,
  Img,
  interpolate,
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
  getNeonFlicker,
  getNeonTextShadow,
  getParticleState,
  getParticles,
  getScanlineOffset,
  getVerticalGridLines,
} from './visual-effects';

export const EndingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const opacity = fadeIn * fadeOut;

  const particles = getParticles();
  const flicker = getNeonFlicker(frame);
  const scanOffset = getScanlineOffset(frame);
  const gridH = getGridLines(frame);
  const gridV = getVerticalGridLines();
  const hudCorners = getHudCorners(width, height);
  const dataStream = getDataStream(frame, 24);

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
      {/* Perspective grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      >
        {gridH.map((line, i) => (
          <div
            key={`h${i}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${line.y * 100}%`,
              height: 1,
              backgroundColor: `rgba(0, 255, 255, ${line.alpha * 0.3})`,
              boxShadow: `0 0 3px rgba(0, 255, 255, ${line.alpha * 0.2})`,
            }}
          />
        ))}
        {gridV.map((line, i) => (
          <div
            key={`v${i}`}
            style={{
              position: 'absolute',
              top: '45%',
              bottom: 0,
              left: `${line.x * 100}%`,
              width: 1,
              backgroundColor: `rgba(0, 255, 255, ${line.alpha * 0.2})`,
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

      {/* Content */}
      <div
        style={{
          opacity: opacity * flicker,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <Img
          src={LogoUrl}
          style={{
            height: 80,
            objectFit: 'contain',
            borderRadius: 16,
            filter: `drop-shadow(0 0 12px rgba(0,255,255,0.5)) drop-shadow(0 0 24px rgba(255,0,255,0.3))`,
          }}
        />
        <div
          style={{
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: 20,
            fontWeight: 500,
            fontFamily: 'monospace, sans-serif',
            letterSpacing: 3,
            textShadow: getNeonTextShadow(CYBER_CYAN, 0.6),
          }}
        >
          Powered by Midscene
        </div>
        {/* Chromatic aberration on URL */}
        <div style={{ position: 'relative', height: 16 }}>
          <span
            style={{
              position: 'absolute',
              left: -1,
              color: `rgba(${CYBER_CYAN.r},${CYBER_CYAN.g},${CYBER_CYAN.b},0.4)`,
              fontSize: 14,
              fontFamily: 'monospace',
              letterSpacing: 2,
            }}
          >
            midscenejs.com
          </span>
          <span
            style={{
              position: 'absolute',
              left: 1,
              color: `rgba(${CYBER_MAGENTA.r},${CYBER_MAGENTA.g},${CYBER_MAGENTA.b},0.4)`,
              fontSize: 14,
              fontFamily: 'monospace',
              letterSpacing: 2,
            }}
          >
            midscenejs.com
          </span>
          <span
            style={{
              position: 'relative',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: 14,
              fontFamily: 'monospace',
              letterSpacing: 2,
            }}
          >
            midscenejs.com
          </span>
        </div>
      </div>

      {/* HUD corners */}
      {hudCorners.map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: c.x - (c.flipX ? 20 : 0),
            top: c.y - (c.flipY ? 20 : 0),
            width: 20,
            height: 20,
            opacity: opacity * 0.7,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 20,
              height: 2,
              backgroundColor: 'rgba(0,255,255,0.6)',
              transform: `scaleX(${c.flipX ? -1 : 1})`,
              transformOrigin: c.flipX ? 'right' : 'left',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 2,
              height: 20,
              backgroundColor: 'rgba(0,255,255,0.6)',
              transform: `scaleY(${c.flipY ? -1 : 1})`,
              transformOrigin: c.flipY ? 'bottom' : 'top',
            }}
          />
        </div>
      ))}

      {/* Data stream */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          color: 'rgba(0,255,255,0.2)',
          fontSize: 10,
          fontFamily: 'monospace',
          letterSpacing: 2,
          opacity,
          pointerEvents: 'none',
        }}
      >
        {dataStream.chars}
      </div>

      {/* Scan lines */}
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
