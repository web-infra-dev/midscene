import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { LogoUrl } from '../../logo';

export const OpeningScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Logo scale: spring in
  const scaleSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  });

  // Logo opacity: fade in 0-20 frames, fade out last 20 frames
  const opacity = interpolate(
    frame,
    [0, 20, durationInFrames - 20, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp' },
  );

  // Logo translateY: static then move up in last 30 frames
  const translateY = interpolate(
    frame,
    [durationInFrames - 30, durationInFrames],
    [0, -60],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3a 100%)',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          opacity,
          transform: `scale(${scaleSpring}) translateY(${translateY}px)`,
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
          }}
        />
        <div
          style={{
            color: '#fff',
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          Midscene
        </div>
      </div>
    </AbsoluteFill>
  );
};
