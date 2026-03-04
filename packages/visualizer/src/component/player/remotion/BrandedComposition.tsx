import { AbsoluteFill, Sequence } from 'remotion';
import { StepsTimeline } from './StepScene';
import type { FrameMap } from './frame-calculator';

export const Composition: React.FC<{
  frameMap: FrameMap;
  autoZoom: boolean;
  subtitleEnabled: boolean;
}> = ({ frameMap, autoZoom, subtitleEnabled }) => {
  const { stepsDurationInFrames } = frameMap;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Sequence from={0} durationInFrames={stepsDurationInFrames}>
        <StepsTimeline
          frameMap={frameMap}
          autoZoom={autoZoom}
          subtitleEnabled={subtitleEnabled}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
