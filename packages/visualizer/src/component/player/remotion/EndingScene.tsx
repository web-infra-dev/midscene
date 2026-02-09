import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { LogoUrl } from '../../logo';

export const EndingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Fade in logo + text
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Fade out everything in last 20 frames
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const opacity = fadeIn * fadeOut;

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
          }}
        />
        <div
          style={{
            color: 'rgba(255, 255, 255, 0.85)',
            fontSize: 20,
            fontWeight: 500,
          }}
        >
          Powered by Midscene
        </div>
        <div
          style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: 14,
          }}
        >
          midscenejs.com
        </div>
      </div>
    </AbsoluteFill>
  );
};
