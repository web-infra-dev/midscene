import { useMemo } from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { mousePointer } from '../../../utils';
import type { StepSegment } from './frame-calculator';

// Easing functions
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

// Matching PIXI player: pointer takes first 37.5%, camera takes rest
const POINTER_PHASE = 0.375;

const CROSSFADE_FRAMES = 10;

interface FlatKeyframe {
  img: string;
  cameraLeft: number;
  cameraTop: number;
  cameraWidth: number;
  pointerLeft: number;
  pointerTop: number;
  localStart: number;
  duration: number;
  title: string;
  stepIndex: number;
  imageWidth: number;
  imageHeight: number;
}

/**
 * A single component that renders the entire steps timeline.
 * No per-step Sequences — one continuous animation with smooth
 * camera/pointer interpolation and image crossfades.
 */
export const StepsTimeline: React.FC<{
  segments: StepSegment[];
}> = ({ segments }) => {
  const frame = useCurrentFrame();
  const { fps, width: compWidth, height: compHeight } = useVideoConfig();

  // Flatten all keyframes into a single timeline with local frame offsets
  const stepsOffset = segments[0]?.startFrame ?? 0;

  const timeline = useMemo<FlatKeyframe[]>(() => {
    return segments.flatMap((seg) =>
      seg.keyframes.map((kf) => ({
        img: kf.img,
        cameraLeft: kf.cameraLeft,
        cameraTop: kf.cameraTop,
        cameraWidth: kf.cameraWidth,
        pointerLeft: kf.pointerLeft,
        pointerTop: kf.pointerTop,
        localStart: seg.startFrame - stepsOffset + kf.startFrame,
        duration: kf.durationInFrames,
        title: seg.title,
        stepIndex: seg.stepIndex,
        imageWidth: seg.imageWidth,
        imageHeight: seg.imageHeight,
      })),
    );
  }, [segments, stepsOffset]);

  if (timeline.length === 0) return null;

  // --- Locate current keyframe ---
  let currIdx = 0;
  for (let i = 0; i < timeline.length; i++) {
    const kf = timeline[i];
    if (frame >= kf.localStart && frame < kf.localStart + kf.duration) {
      currIdx = i;
      break;
    }
    if (i === timeline.length - 1) currIdx = i;
  }

  const curr = timeline[currIdx];
  const prev = currIdx > 0 ? timeline[currIdx - 1] : curr;

  // Progress within current keyframe (0 → 1)
  const rawProgress = Math.min(
    Math.max((frame - curr.localStart) / curr.duration, 0),
    1,
  );

  // --- Pointer leads, camera follows (matching PIXI player behaviour) ---
  const pointerMoved =
    Math.abs(prev.pointerLeft - curr.pointerLeft) > 1 ||
    Math.abs(prev.pointerTop - curr.pointerTop) > 1;

  // Pointer: completes during first 37.5% of keyframe (linear, like PIXI)
  const pointerT = pointerMoved
    ? Math.min(rawProgress / POINTER_PHASE, 1)
    : rawProgress;

  // Camera: waits for pointer, then moves in the remaining 62.5%
  const cameraT = pointerMoved
    ? rawProgress <= POINTER_PHASE
      ? 0
      : easeInOut((rawProgress - POINTER_PHASE) / (1 - POINTER_PHASE))
    : easeInOut(rawProgress);

  // --- Interpolate pointer (linear, arrives early) ---
  const pointerLeft =
    prev.pointerLeft + (curr.pointerLeft - prev.pointerLeft) * pointerT;
  const pointerTop =
    prev.pointerTop + (curr.pointerTop - prev.pointerTop) * pointerT;

  // --- Interpolate camera (starts after pointer arrives) ---
  const cameraLeft =
    prev.cameraLeft + (curr.cameraLeft - prev.cameraLeft) * cameraT;
  const cameraTop =
    prev.cameraTop + (curr.cameraTop - prev.cameraTop) * cameraT;
  const cameraWidth =
    prev.cameraWidth + (curr.cameraWidth - prev.cameraWidth) * cameraT;

  const imgW = curr.imageWidth;
  const imgH = curr.imageHeight;

  // --- CSS transform for zoom / pan ---
  const zoom = imgW / cameraWidth;
  const tx = -cameraLeft * (compWidth / imgW);
  const ty = -cameraTop * (compHeight / imgH);
  const transformStyle = `scale(${zoom}) translate(${tx}px, ${ty}px)`;

  // --- Pointer screen position ---
  const camH = cameraWidth * (imgH / imgW);
  const ptrX = ((pointerLeft - cameraLeft) / cameraWidth) * compWidth;
  const ptrY = ((pointerTop - cameraTop) / camH) * compHeight;
  const showCursor = zoom > 1.08;

  // --- Image crossfade when screenshot changes ---
  const imageChanged = currIdx > 0 && prev.img !== curr.img;
  const crossfadeAlpha = imageChanged
    ? Math.min((frame - curr.localStart) / CROSSFADE_FRAMES, 1)
    : 1;

  // --- Gentle fade-in at the very start (opening → steps transition) ---
  const initialFade = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // --- Step badge & title (reset spring when stepIndex changes) ---
  const stepStartLocal = (() => {
    const seg = segments.find((s) => s.stepIndex === curr.stepIndex);
    return seg ? seg.startFrame - stepsOffset : 0;
  })();
  const frameInStep = frame - stepStartLocal;

  const badgeScale = spring({
    frame: frameInStep,
    fps,
    config: { damping: 12, stiffness: 100 },
    delay: 5,
  });

  const titleTranslateY = interpolate(frameInStep, [5, 20], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const titleOpacity = interpolate(frameInStep, [5, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', opacity: initialFade }}>
      {/* Previous image — shown during crossfade */}
      {imageChanged && crossfadeAlpha < 1 && (
        <div
          style={{
            position: 'absolute',
            width: compWidth,
            height: compHeight,
            overflow: 'hidden',
            opacity: 1 - crossfadeAlpha,
          }}
        >
          <Img
            src={prev.img}
            style={{
              width: compWidth,
              height: compHeight,
              transformOrigin: '0 0',
              transform: transformStyle,
            }}
          />
        </div>
      )}

      {/* Current image */}
      <div
        style={{
          position: 'absolute',
          width: compWidth,
          height: compHeight,
          overflow: 'hidden',
          opacity: imageChanged ? crossfadeAlpha : 1,
        }}
      >
        <Img
          src={curr.img}
          style={{
            width: compWidth,
            height: compHeight,
            transformOrigin: '0 0',
            transform: transformStyle,
          }}
        />
      </div>

      {/* Mouse cursor */}
      {showCursor && (
        <Img
          src={mousePointer}
          style={{
            position: 'absolute',
            left: ptrX - 3,
            top: ptrY - 2,
            width: 22,
            height: 28,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
          }}
        />
      )}

      {/* Step number badge */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          transform: `scale(${badgeScale})`,
          backgroundColor: '#2B83FF',
          color: '#fff',
          width: 40,
          height: 40,
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 700,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {curr.stepIndex + 1}
      </div>

      {/* Title card */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: titleOpacity,
          transform: `translateY(${titleTranslateY}px)`,
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 500,
            maxWidth: '80%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {curr.title}
        </div>
      </div>
    </AbsoluteFill>
  );
};
