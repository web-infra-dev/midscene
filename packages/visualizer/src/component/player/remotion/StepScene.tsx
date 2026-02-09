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
import {
  CHROME_BORDER_RADIUS,
  CHROME_DOTS,
  CHROME_TITLE_BAR_H,
  CYBER_CYAN,
  getBrowser3DTransform,
  getCursorTrail,
  getGlitchSlices,
  getHudCorners,
  getImageBlur,
  getNeonFlicker,
  getNeonTextShadow,
  getRippleState,
  getScanlineOffset,
  getTypewriterChars,
} from './visual-effects';

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

const POINTER_PHASE = 0.375;
const CROSSFADE_FRAMES = 10;

// Chrome shell sizing: the browser frame takes most of the viewport
// with a small margin for 3D breathing room
const BROWSER_MARGIN = 24;

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

export const StepsTimeline: React.FC<{
  segments: StepSegment[];
}> = ({ segments }) => {
  const frame = useCurrentFrame();
  const { fps, width: compWidth, height: compHeight } = useVideoConfig();

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

  const rawProgress = Math.min(
    Math.max((frame - curr.localStart) / curr.duration, 0),
    1,
  );

  const pointerMoved =
    Math.abs(prev.pointerLeft - curr.pointerLeft) > 1 ||
    Math.abs(prev.pointerTop - curr.pointerTop) > 1;

  const pointerT = pointerMoved
    ? Math.min(rawProgress / POINTER_PHASE, 1)
    : rawProgress;

  const cameraT = pointerMoved
    ? rawProgress <= POINTER_PHASE
      ? 0
      : easeInOut((rawProgress - POINTER_PHASE) / (1 - POINTER_PHASE))
    : easeInOut(rawProgress);

  const pointerLeft =
    prev.pointerLeft + (curr.pointerLeft - prev.pointerLeft) * pointerT;
  const pointerTop =
    prev.pointerTop + (curr.pointerTop - prev.pointerTop) * pointerT;

  const cameraLeft =
    prev.cameraLeft + (curr.cameraLeft - prev.cameraLeft) * cameraT;
  const cameraTop =
    prev.cameraTop + (curr.cameraTop - prev.cameraTop) * cameraT;
  const cameraWidth =
    prev.cameraWidth + (curr.cameraWidth - prev.cameraWidth) * cameraT;

  const imgW = curr.imageWidth;
  const imgH = curr.imageHeight;

  // Browser content area dimensions
  const browserW = compWidth - BROWSER_MARGIN * 2;
  const contentH = compHeight - BROWSER_MARGIN * 2 - CHROME_TITLE_BAR_H;
  const browserH = contentH + CHROME_TITLE_BAR_H;

  // Camera transform within content area
  const zoom = imgW / cameraWidth;
  const tx = -cameraLeft * (browserW / imgW);
  const ty = -cameraTop * (contentH / imgH);
  const transformStyle = `scale(${zoom}) translate(${tx}px, ${ty}px)`;

  // Pointer screen position (relative to content area)
  const camH = cameraWidth * (imgH / imgW);
  const ptrX = ((pointerLeft - cameraLeft) / cameraWidth) * browserW;
  const ptrY = ((pointerTop - cameraTop) / camH) * contentH;
  const showCursor = zoom > 1.08;

  const imageChanged = currIdx > 0 && prev.img !== curr.img;
  const crossfadeAlpha = imageChanged
    ? Math.min((frame - curr.localStart) / CROSSFADE_FRAMES, 1)
    : 1;

  const framesIntoKf = frame - curr.localStart;
  const blurPx = getImageBlur(framesIntoKf, imageChanged);

  const initialFade = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: 'clamp',
  });

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

  const typewriter = getTypewriterChars(curr.title, frameInStep, 8, 1.5);
  const flicker = getNeonFlicker(frame);
  const scanOffset = getScanlineOffset(frame);
  const hudCorners = getHudCorners(compWidth, compHeight, 8);

  // 3D transform — only on the first step
  const isFirstStep = curr.stepIndex === 0;
  const transform3d = isFirstStep
    ? getBrowser3DTransform(frameInStep, frame)
    : { rotateX: 0, rotateY: 0, translateZ: 0, scale: 1 };

  // Click ripple — dual neon rings
  const pointerArrivalFrame =
    curr.localStart + Math.floor(curr.duration * POINTER_PHASE);
  const framesAfterArrival = frame - pointerArrivalFrame;
  const ripple = pointerMoved
    ? getRippleState(framesAfterArrival)
    : { active: false, radius: 0, opacity: 0 };
  const ripple2 = pointerMoved
    ? getRippleState(framesAfterArrival - 3)
    : { active: false, radius: 0, opacity: 0 };

  // Glitch on image transition
  const glitchSlices = imageChanged
    ? getGlitchSlices(frame, curr.localStart)
    : [];

  // Cursor trail
  const trailPositions = useMemo(() => {
    if (!showCursor) return [];
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const pastFrame = frame - i;
      if (pastFrame < curr.localStart) break;
      const pastRaw = Math.min(
        Math.max((pastFrame - curr.localStart) / curr.duration, 0),
        1,
      );
      const pastPT = pointerMoved
        ? Math.min(pastRaw / POINTER_PHASE, 1)
        : pastRaw;
      const pastCT = pointerMoved
        ? pastRaw <= POINTER_PHASE
          ? 0
          : easeInOut((pastRaw - POINTER_PHASE) / (1 - POINTER_PHASE))
        : easeInOut(pastRaw);
      const pastPtrX =
        prev.pointerLeft + (curr.pointerLeft - prev.pointerLeft) * pastPT;
      const pastPtrY =
        prev.pointerTop + (curr.pointerTop - prev.pointerTop) * pastPT;
      const pastCamL =
        prev.cameraLeft + (curr.cameraLeft - prev.cameraLeft) * pastCT;
      const pastCamT =
        prev.cameraTop + (curr.cameraTop - prev.cameraTop) * pastCT;
      const pastCamW =
        prev.cameraWidth + (curr.cameraWidth - prev.cameraWidth) * pastCT;
      const pastCamH = pastCamW * (imgH / imgW);
      positions.push({
        x: ((pastPtrX - pastCamL) / pastCamW) * browserW,
        y: ((pastPtrY - pastCamT) / pastCamH) * contentH,
      });
    }
    return positions;
  }, [
    frame,
    curr,
    prev,
    pointerMoved,
    showCursor,
    browserW,
    contentH,
    imgW,
    imgH,
  ]);

  const trail =
    showCursor && pointerMoved ? getCursorTrail(trailPositions) : [];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0a0a12',
        opacity: initialFade,
        perspective: 1200,
      }}
    >
      {/* 3D Browser Shell */}
      <div
        style={{
          position: 'absolute',
          left: BROWSER_MARGIN,
          top: BROWSER_MARGIN,
          width: browserW,
          height: browserH,
          transformStyle: 'preserve-3d',
          transform: [
            `scale(${transform3d.scale})`,
            `rotateX(${transform3d.rotateX}deg)`,
            `rotateY(${transform3d.rotateY}deg)`,
            `translateZ(${transform3d.translateZ}px)`,
          ].join(' '),
          borderRadius: CHROME_BORDER_RADIUS,
          overflow: 'hidden',
          boxShadow: [
            '0 20px 60px rgba(0,0,0,0.6)',
            '0 0 1px rgba(0,255,255,0.3)',
            '0 0 30px rgba(0,255,255,0.08)',
          ].join(', '),
        }}
      >
        {/* Chrome title bar */}
        <div
          style={{
            width: browserW,
            height: CHROME_TITLE_BAR_H,
            background: 'linear-gradient(180deg, #2a2a35 0%, #1e1e28 100%)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 0,
            borderBottom: '1px solid rgba(0,255,255,0.15)',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          {/* Traffic lights */}
          {CHROME_DOTS.map((dot) => (
            <div
              key={dot.color}
              style={{
                position: 'absolute',
                left: dot.x,
                top: '50%',
                marginTop: -5,
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: dot.color,
                boxShadow: `0 0 4px ${dot.color}40`,
              }}
            />
          ))}
          {/* Address bar */}
          <div
            style={{
              position: 'absolute',
              left: 70,
              right: 14,
              top: '50%',
              marginTop: -11,
              height: 22,
              backgroundColor: 'rgba(0,0,0,0.4)',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 10,
              paddingRight: 10,
            }}
          >
            <span
              style={{
                color: 'rgba(0,255,255,0.4)',
                fontSize: 10,
                fontFamily: 'monospace',
                letterSpacing: 0.5,
              }}
            >
              https://
            </span>
            <span
              style={{
                color: 'rgba(255,255,255,0.5)',
                fontSize: 10,
                fontFamily: 'monospace',
                letterSpacing: 0.5,
              }}
            >
              app.example.com
            </span>
          </div>
        </div>

        {/* Browser content area */}
        <div
          style={{
            width: browserW,
            height: contentH,
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#000',
          }}
        >
          {/* Previous image — crossfade */}
          {imageChanged && crossfadeAlpha < 1 && (
            <div
              style={{
                position: 'absolute',
                width: browserW,
                height: contentH,
                overflow: 'hidden',
                opacity: 1 - crossfadeAlpha,
              }}
            >
              <Img
                src={prev.img}
                style={{
                  width: browserW,
                  height: contentH,
                  transformOrigin: '0 0',
                  transform: transformStyle,
                }}
              />
            </div>
          )}

          {/* Current image (with blur transition) */}
          <div
            style={{
              position: 'absolute',
              width: browserW,
              height: contentH,
              overflow: 'hidden',
              opacity: imageChanged ? crossfadeAlpha : 1,
            }}
          >
            <Img
              src={curr.img}
              style={{
                width: browserW,
                height: contentH,
                transformOrigin: '0 0',
                transform: transformStyle,
                filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
              }}
            />
          </div>

          {/* Glitch slices */}
          {glitchSlices.map((slice, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: slice.offsetX,
                top: `${slice.y * 100}%`,
                width: browserW,
                height: `${slice.height * 100}%`,
                overflow: 'hidden',
                opacity: 0.7,
                mixBlendMode: 'screen',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(0,255,255,0.15)',
                  transform: `translateX(${slice.rgbSplit}px)`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(255,0,255,0.15)',
                  transform: `translateX(${-slice.rgbSplit}px)`,
                }}
              />
            </div>
          ))}

          {/* Cursor trail */}
          {trail.map((pt, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: pt.x - pt.size / 2,
                top: pt.y - pt.size / 2,
                width: pt.size,
                height: pt.size,
                borderRadius: '50%',
                backgroundColor: `rgba(0, 255, 255, ${pt.alpha})`,
                boxShadow: `0 0 ${pt.size}px rgba(0, 255, 255, ${pt.alpha * 0.8})`,
                filter: `blur(${pt.size * 0.3}px)`,
                pointerEvents: 'none',
              }}
            />
          ))}

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
                filter:
                  'drop-shadow(0 0 4px rgba(0,255,255,0.6)) drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
              }}
            />
          )}

          {/* Click ripple — cyan */}
          {ripple.active && (
            <div
              style={{
                position: 'absolute',
                left: ptrX - ripple.radius,
                top: ptrY - ripple.radius,
                width: ripple.radius * 2,
                height: ripple.radius * 2,
                borderRadius: '50%',
                border: `2px solid rgba(0, 255, 255, ${ripple.opacity})`,
                boxShadow: `0 0 8px rgba(0, 255, 255, ${ripple.opacity * 0.6}), inset 0 0 8px rgba(0, 255, 255, ${ripple.opacity * 0.3})`,
                pointerEvents: 'none',
              }}
            />
          )}
          {/* Click ripple — magenta (delayed) */}
          {ripple2.active && (
            <div
              style={{
                position: 'absolute',
                left: ptrX - ripple2.radius,
                top: ptrY - ripple2.radius,
                width: ripple2.radius * 2,
                height: ripple2.radius * 2,
                borderRadius: '50%',
                border: `1.5px solid rgba(255, 0, 255, ${ripple2.opacity * 0.7})`,
                boxShadow: `0 0 6px rgba(255, 0, 255, ${ripple2.opacity * 0.4})`,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Scan lines inside content */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `repeating-linear-gradient(
                0deg,
                transparent,
                transparent 3px,
                rgba(0, 0, 0, 0.05) 3px,
                rgba(0, 0, 0, 0.05) 4px
              )`,
              backgroundPositionY: scanOffset,
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Neon edge glow on browser frame */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: CHROME_BORDER_RADIUS,
            boxShadow: 'inset 0 0 1px rgba(0,255,255,0.2)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Step number badge — outside browser, top-left */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          transform: `scale(${badgeScale})`,
          backgroundColor: 'rgba(0, 20, 40, 0.9)',
          color: '#0ff',
          width: 36,
          height: 36,
          borderRadius: 4,
          border: '1px solid rgba(0, 255, 255, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 700,
          fontFamily: 'monospace',
          boxShadow:
            '0 0 8px rgba(0,255,255,0.3), inset 0 0 8px rgba(0,255,255,0.1)',
          textShadow: '0 0 6px rgba(0,255,255,0.8)',
          zIndex: 10,
        }}
      >
        {curr.stepIndex + 1}
      </div>

      {/* Title card — outside browser, bottom center */}
      <div
        style={{
          position: 'absolute',
          bottom: 6,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: titleOpacity * flicker,
          transform: `translateY(${titleTranslateY}px)`,
          zIndex: 10,
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(0, 10, 20, 0.9)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            padding: '8px 20px',
            borderRadius: 2,
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'monospace, sans-serif',
            maxWidth: '80%',
            minWidth: 80,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textShadow: getNeonTextShadow(CYBER_CYAN, 0.4),
            boxShadow:
              '0 0 12px rgba(0,255,255,0.15), inset 0 0 12px rgba(0,255,255,0.05)',
          }}
        >
          {typewriter.text}
          {typewriter.showCursor && (
            <span style={{ color: '#0ff', opacity: 0.9 }}>_</span>
          )}
          <span style={{ visibility: 'hidden', position: 'absolute' }}>
            {curr.title}
          </span>
        </div>
      </div>

      {/* HUD corner brackets — on the full viewport */}
      {hudCorners.map((c, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: c.x - (c.flipX ? 16 : 0),
            top: c.y - (c.flipY ? 16 : 0),
            width: 16,
            height: 16,
            opacity: 0.3,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 16,
              height: 1,
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
              width: 1,
              height: 16,
              backgroundColor: 'rgba(0,255,255,0.6)',
              transform: `scaleY(${c.flipY ? -1 : 1})`,
              transformOrigin: c.flipY ? 'bottom' : 'top',
            }}
          />
        </div>
      ))}
    </AbsoluteFill>
  );
};
