import { useMemo } from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { mouseLoading, mousePointer } from '../../../utils';
import type { FrameMap, ScriptFrame } from './frame-calculator';
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

const POINTER_PHASE = 0.375;
const CROSSFADE_FRAMES = 10;
const BROWSER_MARGIN = 24;

// ── Helpers to derive state from ScriptFrame timeline ──

interface ActiveInsight {
  highlightElement?: ScriptFrame['highlightElement'];
  searchArea?: ScriptFrame['searchArea'];
  alpha: number; // 1 = fully visible, 0 = cleared
}

interface CameraState {
  left: number;
  top: number;
  width: number;
  pointerLeft: number;
  pointerTop: number;
}

interface DerivedState {
  img: string;
  imageWidth: number;
  imageHeight: number;
  prevImg: string | null;
  camera: CameraState;
  prevCamera: CameraState;
  activeInsights: ActiveInsight[];
  spinningPointer: boolean;
  spinningElapsedMs: number;
  currentPointerImg: string;
  title: string;
  subTitle: string;
  taskId: string | undefined;
  frameInScript: number;
  scriptIndex: number;
  imageChanged: boolean;
  pointerMoved: boolean;
  rawProgress: number;
}

function deriveState(
  scriptFrames: ScriptFrame[],
  frame: number,
  imageWidth: number,
  imageHeight: number,
  fps: number,
  autoZoom: boolean,
): DerivedState {
  // Default camera: full image view
  const defaultCamera: CameraState = {
    left: 0,
    top: 0,
    width: imageWidth,
    pointerLeft: Math.round(imageWidth / 2),
    pointerTop: Math.round(imageHeight / 2),
  };

  let currentImg = '';
  let currentImageWidth = imageWidth;
  let currentImageHeight = imageHeight;
  let currentCamera = { ...defaultCamera };
  let prevCamera = { ...defaultCamera };
  let prevImg: string | null = null;
  let activeInsights: ActiveInsight[] = [];
  let isSpinning = false;
  let spinningElapsedMs = 0;
  let currentPointerImg = mousePointer;
  let currentTitle = '';
  let currentSubTitle = '';
  let currentTaskId: string | undefined;
  let frameInScript = 0;
  let currentScriptIndex = 0;
  let imageChanged = false;
  let pointerMoved = false;
  let rawProgress = 0;

  for (let i = 0; i < scriptFrames.length; i++) {
    const sf = scriptFrames[i];
    const sfEnd = sf.startFrame + sf.durationInFrames;

    // Process scripts that are at or before the current frame
    if (sf.durationInFrames === 0) {
      // Instantaneous (pointer)
      if (sf.startFrame <= frame) {
        if (sf.type === 'pointer' && sf.pointerImg) {
          currentPointerImg = sf.pointerImg;
        }
        currentTitle = sf.title || currentTitle;
        currentSubTitle = sf.subTitle || currentSubTitle;
        currentTaskId = sf.taskId ?? currentTaskId;
        currentScriptIndex = i;
      }
      continue;
    }

    if (frame < sf.startFrame) {
      // Future scripts — stop
      break;
    }

    // This script is active or has completed
    currentTitle = sf.title || currentTitle;
    currentSubTitle = sf.subTitle || currentSubTitle;
    currentTaskId = sf.taskId ?? currentTaskId;
    currentScriptIndex = i;
    frameInScript = frame - sf.startFrame;
    rawProgress = Math.min(frameInScript / sf.durationInFrames, 1);

    switch (sf.type) {
      case 'img': {
        if (sf.img) {
          if (currentImg && sf.img !== currentImg) {
            prevImg = currentImg;
            imageChanged = true;
          }
          currentImg = sf.img;
          currentImageWidth = sf.imageWidth || imageWidth;
          currentImageHeight = sf.imageHeight || imageHeight;
        }
        if (sf.cameraTarget) {
          prevCamera = { ...currentCamera };
          currentCamera = {
            left: sf.cameraTarget.left,
            top: sf.cameraTarget.top,
            width: sf.cameraTarget.width,
            pointerLeft: sf.cameraTarget.pointerLeft,
            pointerTop: sf.cameraTarget.pointerTop,
          };
          const pDiff =
            Math.abs(prevCamera.pointerLeft - currentCamera.pointerLeft) > 1 ||
            Math.abs(prevCamera.pointerTop - currentCamera.pointerTop) > 1;
          pointerMoved = pDiff;
        } else if (frame >= sfEnd) {
          // Script completed, no camera
          pointerMoved = false;
          imageChanged = false;
        }
        isSpinning = false;
        break;
      }

      case 'insight': {
        if (sf.img) {
          if (currentImg && sf.img !== currentImg) {
            prevImg = currentImg;
            imageChanged = true;
          }
          currentImg = sf.img;
          currentImageWidth = sf.imageWidth || imageWidth;
          currentImageHeight = sf.imageHeight || imageHeight;
        }

        // Add to active insights
        const alreadyAdded = activeInsights.some(
          (ai) =>
            ai.highlightElement === sf.highlightElement &&
            ai.searchArea === sf.searchArea,
        );
        if (!alreadyAdded) {
          activeInsights.push({
            highlightElement: sf.highlightElement,
            searchArea: sf.searchArea,
            alpha: 1,
          });
        }

        // Camera phase
        if (sf.cameraTarget && sf.insightPhaseFrames !== undefined) {
          const cameraStartFrame = sf.startFrame + sf.insightPhaseFrames;
          if (frame >= cameraStartFrame) {
            prevCamera = { ...currentCamera };
            currentCamera = {
              left: sf.cameraTarget.left,
              top: sf.cameraTarget.top,
              width: sf.cameraTarget.width,
              pointerLeft: sf.cameraTarget.pointerLeft,
              pointerTop: sf.cameraTarget.pointerTop,
            };
            const cameraFrameIn = frame - cameraStartFrame;
            const cameraDur = sf.cameraPhaseFrames || 1;
            rawProgress = Math.min(cameraFrameIn / cameraDur, 1);
            pointerMoved =
              Math.abs(prevCamera.pointerLeft - currentCamera.pointerLeft) >
                1 ||
              Math.abs(prevCamera.pointerTop - currentCamera.pointerTop) > 1;
          }
        }
        isSpinning = false;
        break;
      }

      case 'clear-insight': {
        const alpha = 1 - rawProgress;
        activeInsights = activeInsights.map((ai) => ({ ...ai, alpha }));
        if (frame >= sfEnd) {
          activeInsights = [];
        }
        isSpinning = false;
        break;
      }

      case 'spinning-pointer': {
        isSpinning = true;
        spinningElapsedMs = (frameInScript / fps) * 1000;
        break;
      }

      case 'sleep': {
        // Keep current state, do nothing
        isSpinning = false;
        break;
      }
    }

    // If script is fully completed, reset transient state
    if (frame >= sfEnd) {
      if (sf.type !== 'clear-insight') {
        imageChanged = false;
      }
      pointerMoved = false;
      rawProgress = 1;
      // Commit camera position so subsequent scripts without camera
      // don't interpolate back to a stale prevCamera
      if (sf.cameraTarget) {
        prevCamera = { ...currentCamera };
      }
    }
  }

  return {
    img: currentImg,
    imageWidth: currentImageWidth,
    imageHeight: currentImageHeight,
    prevImg: imageChanged ? prevImg : null,
    camera: currentCamera,
    prevCamera,
    activeInsights,
    spinningPointer: isSpinning,
    spinningElapsedMs,
    currentPointerImg,
    title: currentTitle,
    subTitle: currentSubTitle,
    taskId: currentTaskId,
    frameInScript,
    scriptIndex: currentScriptIndex,
    imageChanged,
    pointerMoved,
    rawProgress,
  };
}

// ── Main Component ──

export const StepsTimeline: React.FC<{
  frameMap: FrameMap;
  effects: boolean;
  autoZoom: boolean;
}> = ({ frameMap, effects, autoZoom }) => {
  const frame = useCurrentFrame();
  const { fps, width: compWidth, height: compHeight } = useVideoConfig();

  const {
    scriptFrames,
    imageWidth: baseImgW,
    imageHeight: baseImgH,
  } = frameMap;

  const state = useMemo(
    () => deriveState(scriptFrames, frame, baseImgW, baseImgH, fps, autoZoom),
    [scriptFrames, frame, baseImgW, baseImgH, fps, autoZoom],
  );

  if (!state.img) return null;

  const {
    img,
    imageWidth: imgW,
    imageHeight: imgH,
    prevImg,
    camera,
    prevCamera,
    activeInsights,
    spinningPointer,
    spinningElapsedMs,
    currentPointerImg,
    title,
    frameInScript,
    scriptIndex,
    imageChanged,
    pointerMoved,
    rawProgress,
  } = state;

  // ── Camera interpolation (linear — matches original pixi.js cubicMouse/cubicImage) ──
  const pT = pointerMoved
    ? Math.min(rawProgress / POINTER_PHASE, 1)
    : rawProgress;
  const cT = pointerMoved
    ? rawProgress <= POINTER_PHASE
      ? 0
      : Math.min((rawProgress - POINTER_PHASE) / (1 - POINTER_PHASE), 1)
    : rawProgress;

  const pointerLeft =
    prevCamera.pointerLeft + (camera.pointerLeft - prevCamera.pointerLeft) * pT;
  const pointerTop =
    prevCamera.pointerTop + (camera.pointerTop - prevCamera.pointerTop) * pT;

  const cameraLeft = autoZoom
    ? prevCamera.left + (camera.left - prevCamera.left) * cT
    : 0;
  const cameraTop = autoZoom
    ? prevCamera.top + (camera.top - prevCamera.top) * cT
    : 0;
  const cameraWidth = autoZoom
    ? prevCamera.width + (camera.width - prevCamera.width) * cT
    : imgW;

  // ── Layout calculations ──
  const browserW = effects ? compWidth - BROWSER_MARGIN * 2 : compWidth;
  const contentH = effects
    ? compHeight - BROWSER_MARGIN * 2 - CHROME_TITLE_BAR_H
    : compHeight;
  const browserH = effects ? contentH + CHROME_TITLE_BAR_H : compHeight;

  const zoom = imgW / cameraWidth;
  const tx = -cameraLeft * (browserW / imgW);
  const ty = -cameraTop * (contentH / imgH);
  const transformStyle = `scale(${zoom}) translate(${tx}px, ${ty}px)`;

  const camH = cameraWidth * (imgH / imgW);
  const ptrX = ((pointerLeft - cameraLeft) / cameraWidth) * browserW;
  const ptrY = ((pointerTop - cameraTop) / camH) * contentH;
  const showCursor = autoZoom && zoom > 1.08;

  const crossfadeAlpha = imageChanged
    ? Math.min(frameInScript / CROSSFADE_FRAMES, 1)
    : 1;

  const blurPx = effects ? getImageBlur(frameInScript, imageChanged) : 0;

  const initialFade = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // Badge animation
  const badgeScale = spring({
    frame: frameInScript,
    fps,
    config: { damping: 12, stiffness: 100 },
    delay: 5,
  });

  // Title animation
  const titleTranslateY = interpolate(frameInScript, [5, 20], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const titleOpacity = interpolate(frameInScript, [5, 20], [0, 1], {
    extrapolateRight: 'clamp',
  });

  // ── Effects-only visual calculations ──
  const typewriter = effects
    ? getTypewriterChars(title, frameInScript, 8, 1.5)
    : null;
  const flicker = effects ? getNeonFlicker(frame) : 1;
  const scanOffset = effects ? getScanlineOffset(frame) : 0;
  const hudCorners = effects ? getHudCorners(compWidth, compHeight, 8) : [];

  const isFirstStep = scriptIndex === 0;
  const transform3d =
    effects && isFirstStep
      ? getBrowser3DTransform(frameInScript, frame)
      : { rotateX: 0, rotateY: 0, translateZ: 0, scale: 1 };

  const pointerArrivalFrame = Math.floor(frameInScript * POINTER_PHASE);
  const framesAfterArrival = frameInScript - pointerArrivalFrame;
  const ripple =
    effects && pointerMoved
      ? getRippleState(framesAfterArrival)
      : { active: false, radius: 0, opacity: 0 };
  const ripple2 =
    effects && pointerMoved
      ? getRippleState(framesAfterArrival - 3)
      : { active: false, radius: 0, opacity: 0 };

  const glitchSlices =
    effects && imageChanged
      ? getGlitchSlices(frame, frame - frameInScript)
      : [];

  // Cursor trail
  const trailPositions = useMemo(() => {
    if (!showCursor || !effects) return [];
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const pastFrame = frame - i;
      if (pastFrame < 0) break;
      // Simplified trail positions at current pointer location
      positions.push({ x: ptrX, y: ptrY });
    }
    return positions;
  }, [frame, showCursor, effects, ptrX, ptrY]);

  const trail =
    showCursor && pointerMoved && effects ? getCursorTrail(trailPositions) : [];

  // ── Spinning pointer rotation ──
  const spinRotation = spinningPointer
    ? ((Math.sin(spinningElapsedMs / 500 - Math.PI / 2) + 1) / 2) * Math.PI * 2
    : 0;

  // ── Content rendering helpers ──
  const contentOffset = effects ? BROWSER_MARGIN : 0;
  const titleBarOffset = effects ? CHROME_TITLE_BAR_H : 0;

  // Background color
  const bgColor = effects ? '#0a0a12' : '#f4f4f4';

  // ── Insight overlay rendering ──
  const renderInsightOverlays = () => {
    if (activeInsights.length === 0) return null;
    return activeInsights.map((insight, idx) => {
      const overlays: React.ReactNode[] = [];

      if (insight.highlightElement) {
        const el = insight.highlightElement;
        const rect = el.rect;
        overlays.push(
          <div
            key={`highlight-${idx}`}
            style={{
              position: 'absolute',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              background: 'rgba(253, 89, 7, 0.4)',
              border: '1px solid #fd5907',
              boxShadow: '4px 4px 2px rgba(51, 51, 51, 0.4)',
              opacity: insight.alpha,
              pointerEvents: 'none',
            }}
          >
            {el.description && (
              <span
                style={{
                  position: 'absolute',
                  top: -22,
                  left: 0,
                  fontSize: 18,
                  color: '#000',
                  whiteSpace: 'nowrap',
                }}
              >
                {el.description}
              </span>
            )}
          </div>,
        );
      }

      if (insight.searchArea) {
        const rect = insight.searchArea;
        overlays.push(
          <div
            key={`search-${idx}`}
            style={{
              position: 'absolute',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              background: 'rgba(2, 131, 145, 0.4)',
              border: '1px solid #028391',
              boxShadow: '4px 4px 2px rgba(51, 51, 51, 0.4)',
              opacity: insight.alpha,
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -22,
                left: 0,
                fontSize: 18,
                color: '#000',
                whiteSpace: 'nowrap',
              }}
            >
              Search Area
            </span>
          </div>,
        );
      }

      return overlays;
    });
  };

  if (effects) {
    // ── Effects mode: cyberpunk chrome browser shell ──
    return (
      <AbsoluteFill
        style={{
          backgroundColor: bgColor,
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
            {imageChanged && prevImg && crossfadeAlpha < 1 && (
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
                  src={prevImg}
                  style={{
                    width: browserW,
                    height: contentH,
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
                width: browserW,
                height: contentH,
                overflow: 'hidden',
                opacity: imageChanged ? crossfadeAlpha : 1,
              }}
            >
              <Img
                src={img}
                style={{
                  width: browserW,
                  height: contentH,
                  transformOrigin: '0 0',
                  transform: transformStyle,
                  filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
                }}
              />
              {/* Insight overlays (inside camera transform) */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: browserW,
                  height: contentH,
                  transformOrigin: '0 0',
                  transform: transformStyle,
                  pointerEvents: 'none',
                }}
              >
                {renderInsightOverlays()}
              </div>
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

            {/* Spinning pointer */}
            {spinningPointer && (
              <Img
                src={mouseLoading}
                style={{
                  position: 'absolute',
                  left: ptrX - 11,
                  top: ptrY - 14,
                  width: 22,
                  height: 28,
                  transform: `rotate(${spinRotation}rad)`,
                  transformOrigin: 'center center',
                  filter: effects
                    ? 'drop-shadow(0 0 4px rgba(0,255,255,0.6)) drop-shadow(0 1px 2px rgba(0,0,0,0.5))'
                    : undefined,
                }}
              />
            )}

            {/* Mouse cursor */}
            {showCursor && !spinningPointer && (
              <Img
                src={currentPointerImg}
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
                backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0, 0, 0, 0.05) 3px, rgba(0, 0, 0, 0.05) 4px)`,
                backgroundPositionY: scanOffset,
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* Neon edge glow */}
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

        {/* Step number badge */}
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
          {scriptIndex + 1}
        </div>

        {/* Title card — cyberpunk typewriter */}
        {typewriter && (
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
                {title}
              </span>
            </div>
          </div>
        )}

        {/* HUD corners */}
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
  }

  // ── Clean mode (no effects) ──
  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        opacity: initialFade,
      }}
    >
      {/* Content area — full viewport */}
      <div
        style={{
          width: compWidth,
          height: compHeight,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Previous image — crossfade */}
        {imageChanged && prevImg && crossfadeAlpha < 1 && (
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
              src={prevImg}
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
            src={img}
            style={{
              width: compWidth,
              height: compHeight,
              transformOrigin: '0 0',
              transform: transformStyle,
            }}
          />
          {/* Insight overlays */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: compWidth,
              height: compHeight,
              transformOrigin: '0 0',
              transform: transformStyle,
              pointerEvents: 'none',
            }}
          >
            {renderInsightOverlays()}
          </div>
        </div>

        {/* Spinning pointer */}
        {spinningPointer && (
          <Img
            src={mouseLoading}
            style={{
              position: 'absolute',
              left: ptrX - 11,
              top: ptrY - 14,
              width: 22,
              height: 28,
              transform: `rotate(${spinRotation}rad)`,
              transformOrigin: 'center center',
            }}
          />
        )}

        {/* Mouse cursor */}
        {showCursor && !spinningPointer && (
          <Img
            src={currentPointerImg}
            style={{
              position: 'absolute',
              left: ptrX - 3,
              top: ptrY - 2,
              width: 22,
              height: 28,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
            }}
          />
        )}
      </div>

      {/* Title — simple display at bottom */}
      {title && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            opacity: titleOpacity,
            transform: `translateY(${titleTranslateY}px)`,
            zIndex: 10,
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              color: '#333',
              padding: '6px 16px',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 500,
              maxWidth: '80%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            }}
          >
            {title}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
