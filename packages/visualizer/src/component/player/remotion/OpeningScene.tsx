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
  ChromaticText,
  HudCorners,
  NeonParticles,
  PerspectiveGrid,
  ScanlineOverlay,
  VignetteOverlay,
} from './CyberOverlays';
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

  // Scale factor for narrow screens (reference width = 960)
  const scaleFactor = Math.min(width / 960, 1);

  const breathing = getLogoBreathing(frame);
  const rawParticles = getParticles();
  const flicker = getNeonFlicker(frame);
  const scanOffset = getScanlineOffset(frame);
  const gridH = getGridLines(frame);
  const gridV = getVerticalGridLines();
  const hudCorners = getHudCorners(width, height);
  const dataStream = getDataStream(frame, 32);

  const hudOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const particleData = rawParticles.map((p, i) => ({
    state: getParticleState(p, frame),
    color: getCyberParticleColor(i),
  }));

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
      <PerspectiveGrid horizontalLines={gridH} verticalLines={gridV} />
      <NeonParticles particles={particleData} />

      {/* Main content */}
      <div
        style={{
          opacity: opacity * flicker,
          transform: `scale(${scaleSpring * breathing.scale}) translateY(${translateY}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24 * scaleFactor,
        }}
      >
        <Img
          src={LogoUrl}
          style={{
            height: 120 * scaleFactor,
            objectFit: 'contain',
            borderRadius: 24 * scaleFactor,
            filter: [
              `drop-shadow(0 0 ${breathing.glowRadius}px rgba(0,255,255,${breathing.glowIntensity}))`,
              `drop-shadow(0 0 ${breathing.glowRadius * 2}px rgba(255,0,255,${breathing.glowIntensity * 0.4}))`,
            ].join(' '),
          }}
        />
        <div
          style={{
            color: '#fff',
            fontSize: 48 * scaleFactor,
            fontWeight: 700,
            letterSpacing: 4 * scaleFactor,
            textShadow: getNeonTextShadow(CYBER_CYAN, flicker),
            fontFamily: 'monospace, sans-serif',
          }}
        >
          Midscene
        </div>
        <ChromaticText
          text="AI-POWERED AUTOMATION"
          fontSize={14 * scaleFactor}
          cyanColor={CYBER_CYAN}
          magentaColor={CYBER_MAGENTA}
          letterSpacing={6 * scaleFactor}
          height={20 * scaleFactor}
        />
      </div>

      <HudCorners corners={hudCorners} opacity={hudOpacity} />

      {/* Data stream at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          color: 'rgba(0,255,255,0.25)',
          fontSize: 10,
          fontFamily: 'monospace',
          letterSpacing: 2,
          opacity: hudOpacity,
          pointerEvents: 'none',
        }}
      >
        {dataStream.chars}
      </div>

      <ScanlineOverlay offset={scanOffset} />
      <VignetteOverlay />
    </AbsoluteFill>
  );
};
