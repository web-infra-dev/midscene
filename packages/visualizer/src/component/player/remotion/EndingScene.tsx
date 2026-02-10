import {
  AbsoluteFill,
  Img,
  interpolate,
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

  // Scale factor for narrow screens (reference width = 960)
  const scaleFactor = Math.min(width / 960, 1);

  const rawParticles = getParticles();
  const flicker = getNeonFlicker(frame);
  const scanOffset = getScanlineOffset(frame);
  const gridH = getGridLines(frame);
  const gridV = getVerticalGridLines();
  const hudCorners = getHudCorners(width, height);
  const dataStream = getDataStream(frame, 24);

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
      <PerspectiveGrid
        horizontalLines={gridH}
        verticalLines={gridV}
        opacity={0.5}
      />
      <NeonParticles particles={particleData} />

      {/* Content */}
      <div
        style={{
          opacity: opacity * flicker,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16 * scaleFactor,
        }}
      >
        <Img
          src={LogoUrl}
          style={{
            height: 80 * scaleFactor,
            objectFit: 'contain',
            borderRadius: 16 * scaleFactor,
            filter:
              'drop-shadow(0 0 12px rgba(0,255,255,0.5)) drop-shadow(0 0 24px rgba(255,0,255,0.3))',
          }}
        />
        <div
          style={{
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: 20 * scaleFactor,
            fontWeight: 500,
            fontFamily: 'monospace, sans-serif',
            letterSpacing: 3 * scaleFactor,
            textShadow: getNeonTextShadow(CYBER_CYAN, 0.6),
          }}
        >
          Powered by Midscene
        </div>
        <ChromaticText
          text="midscenejs.com"
          fontSize={14 * scaleFactor}
          cyanColor={CYBER_CYAN}
          magentaColor={CYBER_MAGENTA}
          baseColor="rgba(255, 255, 255, 0.6)"
          cyanAlpha={0.4}
          magentaAlpha={0.4}
          letterSpacing={2 * scaleFactor}
          height={16 * scaleFactor}
        />
      </div>

      <HudCorners corners={hudCorners} opacity={opacity * 0.7} />

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

      <ScanlineOverlay offset={scanOffset} />
      <VignetteOverlay />
    </AbsoluteFill>
  );
};
