import { AbsoluteFill, Sequence } from 'remotion';
import { EndingScene } from './EndingScene';
import { OpeningScene } from './OpeningScene';
import { ProgressBar } from './ProgressBar';
import { StepsTimeline } from './StepScene';
import type { FrameMap } from './frame-calculator';

export const Composition: React.FC<{
  frameMap: FrameMap;
  effects: boolean;
  autoZoom: boolean;
}> = ({ frameMap, effects, autoZoom }) => {
  const {
    openingDurationInFrames,
    endingDurationInFrames,
    stepsDurationInFrames,
    totalDurationInFrames,
  } = frameMap;

  const endingStart = totalDurationInFrames - endingDurationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: effects ? '#000' : '#f4f4f4' }}>
      {/* Opening — effects mode only */}
      {effects && openingDurationInFrames > 0 && (
        <Sequence from={0} durationInFrames={openingDurationInFrames}>
          <OpeningScene />
        </Sequence>
      )}

      {/* Steps — always render */}
      <Sequence
        from={openingDurationInFrames}
        durationInFrames={stepsDurationInFrames}
      >
        <StepsTimeline
          frameMap={frameMap}
          effects={effects}
          autoZoom={autoZoom}
        />
      </Sequence>

      {/* Ending — effects mode only */}
      {effects && endingDurationInFrames > 0 && (
        <Sequence from={endingStart} durationInFrames={endingDurationInFrames}>
          <EndingScene />
        </Sequence>
      )}

      {/* Progress bar — effects mode only */}
      {effects && <ProgressBar />}
    </AbsoluteFill>
  );
};

/** @deprecated Use Composition instead */
export const BrandedComposition = Composition;
