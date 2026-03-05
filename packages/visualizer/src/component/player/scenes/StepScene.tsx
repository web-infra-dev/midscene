import { useMemo } from 'react';
import { mouseLoading } from '../../../utils';
import { deriveFrameState } from './derive-frame-state';
import type { FrameMap } from './frame-calculator';

const POINTER_PHASE = 0.375;
const CROSSFADE_FRAMES = 10;

// ── Main Component ──

export const StepsTimeline: React.FC<{
  frameMap: FrameMap;
  autoZoom: boolean;
  frame: number;
  width: number;
  height: number;
  fps: number;
}> = ({
  frameMap,
  autoZoom,
  frame,
  width: compWidth,
  height: compHeight,
  fps,
}) => {
  const {
    scriptFrames,
    imageWidth: baseImgW,
    imageHeight: baseImgH,
  } = frameMap;

  const state = useMemo(
    () => deriveFrameState(scriptFrames, frame, baseImgW, baseImgH, fps),
    [scriptFrames, frame, baseImgW, baseImgH, fps],
  );

  if (!state.img) return null;

  const {
    img,
    imageWidth: imgW,
    imageHeight: imgH,
    prevImg,
    camera,
    prevCamera,
    insights,
    spinning: spinningPointer,
    spinningElapsedMs,
    currentPointerImg,
    title,
    subTitle,
    frameInScript,
    imageChanged,
    pointerMoved,
    rawProgress,
  } = state;

  // ── Camera interpolation ──
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
  const isPortraitImage = imgH > imgW;
  const browserW = isPortraitImage
    ? Math.round(compHeight * (imgW / imgH))
    : compWidth;
  const portraitLeft = Math.round((compWidth - browserW) / 2);

  const zoom = imgW / cameraWidth;
  const tx = -cameraLeft * (browserW / imgW);
  const ty = -cameraTop * (compHeight / imgH);
  const transformStyle = `scale(${zoom}) translate(${tx}px, ${ty}px)`;

  const camH = cameraWidth * (imgH / imgW);
  const ptrX = ((pointerLeft - cameraLeft) / cameraWidth) * browserW;
  const ptrY = ((pointerTop - cameraTop) / camH) * compHeight;
  const showCursor =
    camera.pointerLeft !== Math.round(imgW / 2) ||
    camera.pointerTop !== Math.round(imgH / 2) ||
    prevCamera.pointerLeft !== Math.round(imgW / 2) ||
    prevCamera.pointerTop !== Math.round(imgH / 2);

  const crossfadeAlpha = imageChanged
    ? Math.min(frameInScript / CROSSFADE_FRAMES, 1)
    : 1;

  const spinRotation = spinningPointer
    ? ((Math.sin(spinningElapsedMs / 500 - Math.PI / 2) + 1) / 2) * Math.PI * 2
    : 0;

  // ── Insight overlay rendering ──
  const renderInsightOverlays = () => {
    if (insights.length === 0) return null;
    return insights.map((insight, idx) => {
      const overlays: React.ReactNode[] = [];

      if (insight.highlightElement) {
        const rect = insight.highlightElement.rect;
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
          />,
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
          />,
        );
      }

      return overlays;
    });
  };

  // ── Content area rendering ──
  const renderContentArea = (w: number, h: number) => (
    <div
      style={{
        width: w,
        height: h,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {imageChanged && prevImg && crossfadeAlpha < 1 && (
        <div
          style={{
            position: 'absolute',
            width: w,
            height: h,
            overflow: 'hidden',
            opacity: 1 - crossfadeAlpha,
          }}
        >
          <img
            alt=""
            src={prevImg}
            style={{
              width: w,
              height: h,
              transformOrigin: '0 0',
              transform: transformStyle,
            }}
          />
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          width: w,
          height: h,
          overflow: 'hidden',
          opacity: imageChanged ? crossfadeAlpha : 1,
        }}
      >
        <img
          alt=""
          src={img}
          style={{
            width: w,
            height: h,
            transformOrigin: '0 0',
            transform: transformStyle,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: w,
            height: h,
            transformOrigin: '0 0',
            transform: transformStyle,
            pointerEvents: 'none',
          }}
        >
          {renderInsightOverlays()}
        </div>
      </div>

      {spinningPointer && (
        <img
          alt=""
          src={mouseLoading}
          style={{
            position: 'absolute',
            left: ptrX - 11,
            top: ptrY - 14,
            width: 22,
            height: 28,
            transform: `rotate(${spinRotation}rad)`,
            transformOrigin: 'center center',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        />
      )}

      {showCursor && !spinningPointer && (
        <img
          alt=""
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
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000',
      }}
    >
      {isPortraitImage ? (
        <div
          style={{
            position: 'absolute',
            left: portraitLeft,
            top: 0,
            width: browserW,
            height: compHeight,
            overflow: 'hidden',
          }}
        >
          {renderContentArea(browserW, compHeight)}
        </div>
      ) : (
        renderContentArea(compWidth, compHeight)
      )}
    </div>
  );
};
