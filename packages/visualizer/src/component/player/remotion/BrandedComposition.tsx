import { AbsoluteFill, Sequence } from 'remotion';
import type { AnimationScript } from '../../../utils/replay-scripts';
import { EndingScene } from './EndingScene';
import { OpeningScene } from './OpeningScene';
import { ProgressBar } from './ProgressBar';
import { StepsTimeline } from './StepScene';
import type { FrameMap } from './frame-calculator';

export const BrandedComposition: React.FC<{
  frameMap: FrameMap;
  scripts: AnimationScript[];
}> = ({ frameMap }) => {
  const {
    segments,
    openingDurationInFrames,
    endingDurationInFrames,
    stepsDurationInFrames,
    totalDurationInFrames,
  } = frameMap;

  const endingStart = totalDurationInFrames - endingDurationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Opening */}
      <Sequence from={0} durationInFrames={openingDurationInFrames}>
        <OpeningScene />
      </Sequence>

      {/* All steps as a single continuous timeline */}
      {segments.length > 0 && (
        <Sequence
          from={openingDurationInFrames}
          durationInFrames={stepsDurationInFrames}
        >
          <StepsTimeline segments={segments} />
        </Sequence>
      )}

      {/* Ending */}
      <Sequence from={endingStart} durationInFrames={endingDurationInFrames}>
        <EndingScene />
      </Sequence>

      {/* Progress bar overlay */}
      <ProgressBar />
    </AbsoluteFill>
  );
};
