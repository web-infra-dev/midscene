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
  ANDROID_BORDER_RADIUS,
  ANDROID_NAV_BAR_H,
  ANDROID_STATUS_BAR_H,
  CHROME_BORDER_RADIUS,
  CHROME_DOTS,
  CHROME_TITLE_BAR_H,
  DESKTOP_APP_TITLE_BAR_H,
  type DeviceShellType,
  IPHONE_BORDER_RADIUS,
  IPHONE_HOME_INDICATOR_H,
  IPHONE_STATUS_BAR_H,
  getBrowser3DTransform,
  getCursorTrail,
  getDeviceLayout,
  getGlitchSlices,
  getHudCorners,
  getImageBlur,
  getRippleState,
  getScanlineOffset,
  resolveShellType,
} from './visual-effects';

const POINTER_PHASE = 0.375;
const CROSSFADE_FRAMES = 10;

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

    if (sf.durationInFrames === 0) {
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
      break;
    }

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
        isSpinning = false;
        break;
      }
    }

    if (frame >= sfEnd) {
      if (sf.type !== 'clear-insight') {
        imageChanged = false;
      }
      pointerMoved = false;
      rawProgress = 1;
      if (sf.cameraTarget) {
        prevCamera = { ...currentCamera };
      }
    }
  }

  if (!currentImg) {
    const firstImgScript = scriptFrames.find(
      (sf) => sf.type === 'img' && sf.img,
    );
    if (firstImgScript) {
      currentImg = firstImgScript.img!;
      currentImageWidth = firstImgScript.imageWidth || imageWidth;
      currentImageHeight = firstImgScript.imageHeight || imageHeight;
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
    subTitle,
    frameInScript,
    scriptIndex,
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
  const shellType = resolveShellType(frameMap.deviceType);
  const deviceLayout = getDeviceLayout(shellType);
  const DEVICE_MARGIN = effects ? deviceLayout.margin : 0;
  const browserW = effects ? compWidth - DEVICE_MARGIN * 2 : compWidth;
  const contentH = effects
    ? compHeight -
      DEVICE_MARGIN * 2 -
      deviceLayout.topInset -
      deviceLayout.bottomInset
    : compHeight;
  const browserH = effects
    ? contentH + deviceLayout.topInset + deviceLayout.bottomInset
    : compHeight;

  const zoom = imgW / cameraWidth;
  const tx = -cameraLeft * (browserW / imgW);
  const ty = -cameraTop * (contentH / imgH);
  const transformStyle = `scale(${zoom}) translate(${tx}px, ${ty}px)`;

  const camH = cameraWidth * (imgH / imgW);
  const ptrX = ((pointerLeft - cameraLeft) / cameraWidth) * browserW;
  const ptrY = ((pointerTop - cameraTop) / camH) * contentH;
  const hasPointerData =
    camera.pointerLeft !== Math.round(imgW / 2) ||
    camera.pointerTop !== Math.round(imgH / 2) ||
    prevCamera.pointerLeft !== Math.round(imgW / 2) ||
    prevCamera.pointerTop !== Math.round(imgH / 2);
  const showCursor = hasPointerData;

  const crossfadeAlpha = imageChanged
    ? Math.min(frameInScript / CROSSFADE_FRAMES, 1)
    : 1;

  const blurPx = effects ? getImageBlur(frameInScript, imageChanged) : 0;

  const initialFade = effects
    ? interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' })
    : 1;

  const badgeScale = spring({
    frame: frameInScript,
    fps,
    config: { damping: 12, stiffness: 100 },
    delay: 5,
  });

  // ── Effects-only visual calculations ──
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

  const trailPositions = useMemo(() => {
    if (!showCursor || !effects) return [];
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const pastFrame = frame - i;
      if (pastFrame < 0) break;
      positions.push({ x: ptrX, y: ptrY });
    }
    return positions;
  }, [frame, showCursor, effects, ptrX, ptrY]);

  const trail =
    showCursor && pointerMoved && effects ? getCursorTrail(trailPositions) : [];

  const spinRotation = spinningPointer
    ? ((Math.sin(spinningElapsedMs / 500 - Math.PI / 2) + 1) / 2) * Math.PI * 2
    : 0;

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

  // ── Shared content area rendering (used by all device shells in effects mode) ──
  const renderContentArea = (w: number, h: number) => (
    <div
      style={{
        width: w,
        height: h,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#000',
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
          <Img
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
        <Img
          src={img}
          style={{
            width: w,
            height: h,
            transformOrigin: '0 0',
            transform: transformStyle,
            filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
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

      {glitchSlices.map((slice, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: slice.offsetX,
            top: `${slice.y * 100}%`,
            width: w,
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
            filter:
              'drop-shadow(0 0 4px rgba(0,255,255,0.6)) drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
          }}
        />
      )}

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

      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0, 0, 0, 0.05) 3px, rgba(0, 0, 0, 0.05) 4px)',
          backgroundPositionY: scanOffset,
          pointerEvents: 'none',
        }}
      />
    </div>
  );

  // ── Device shell renderers ──

  const renderDesktopBrowserTop = () => (
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
  );

  const renderDesktopAppTop = () => (
    <div
      style={{
        width: browserW,
        height: DESKTOP_APP_TITLE_BAR_H,
        background: 'linear-gradient(180deg, #2a2a35 0%, #1e1e28 100%)',
        display: 'flex',
        alignItems: 'center',
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
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          textAlign: 'center',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 11,
          fontFamily: 'monospace',
          letterSpacing: 0.5,
        }}
      >
        Desktop Application
      </span>
    </div>
  );

  const renderIPhoneTop = () => (
    <div
      style={{
        width: browserW,
        height: IPHONE_STATUS_BAR_H,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        9:41
      </span>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 120,
          height: 34,
          borderRadius: 17,
          backgroundColor: '#000',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="16" height="12" viewBox="0 0 16 12">
          <rect x="0" y="8" width="3" height="4" rx="0.5" fill="#fff" />
          <rect x="4" y="5" width="3" height="7" rx="0.5" fill="#fff" />
          <rect x="8" y="2" width="3" height="10" rx="0.5" fill="#fff" />
          <rect x="12" y="0" width="3" height="12" rx="0.5" fill="#fff" />
        </svg>
        <svg width="14" height="12" viewBox="0 0 14 12">
          <path
            d="M7 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM3.5 8.5C4.5 7.2 5.7 6.5 7 6.5s2.5.7 3.5 2"
            stroke="#fff"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M1 5.5C2.8 3.2 4.8 2 7 2s4.2 1.2 6 3.5"
            stroke="#fff"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: 22,
              height: 11,
              border: '1px solid rgba(255,255,255,0.5)',
              borderRadius: 3,
              padding: 1,
            }}
          >
            <div
              style={{
                width: '80%',
                height: '100%',
                backgroundColor: '#34c759',
                borderRadius: 1.5,
              }}
            />
          </div>
          <div
            style={{
              width: 2,
              height: 5,
              backgroundColor: 'rgba(255,255,255,0.5)',
              borderRadius: '0 1px 1px 0',
              marginLeft: 0.5,
            }}
          />
        </div>
      </div>
    </div>
  );

  const renderIPhoneBottom = () => (
    <div
      style={{
        width: browserW,
        height: IPHONE_HOME_INDICATOR_H,
        background: '#000',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 8,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 134,
          height: 5,
          borderRadius: 3,
          backgroundColor: 'rgba(255,255,255,0.5)',
        }}
      />
    </div>
  );

  const renderAndroidTop = () => (
    <div
      style={{
        width: browserW,
        height: ANDROID_STATUS_BAR_H,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: '#fff',
          fontSize: 12,
          fontFamily: 'Roboto, sans-serif',
        }}
      >
        12:00
      </span>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 12,
          height: 12,
          borderRadius: '50%',
          backgroundColor: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="14" height="12" viewBox="0 0 14 12">
          <rect x="0" y="8" width="2.5" height="4" rx="0.5" fill="#fff" />
          <rect x="3.5" y="5" width="2.5" height="7" rx="0.5" fill="#fff" />
          <rect x="7" y="2" width="2.5" height="10" rx="0.5" fill="#fff" />
          <rect x="10.5" y="0" width="2.5" height="12" rx="0.5" fill="#fff" />
        </svg>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: 20,
              height: 10,
              border: '1px solid rgba(255,255,255,0.5)',
              borderRadius: 2,
              padding: 1,
            }}
          >
            <div
              style={{
                width: '75%',
                height: '100%',
                backgroundColor: '#fff',
                borderRadius: 1,
              }}
            />
          </div>
          <div
            style={{
              width: 2,
              height: 4,
              backgroundColor: 'rgba(255,255,255,0.5)',
              borderRadius: '0 1px 1px 0',
              marginLeft: 0.5,
            }}
          />
        </div>
      </div>
    </div>
  );

  const renderAndroidBottom = () => (
    <div
      style={{
        width: browserW,
        height: ANDROID_NAV_BAR_H,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16">
        <polygon
          points="11,2 5,8 11,14"
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.5"
        />
      </svg>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.5"
        />
      </svg>
      <svg width="16" height="16" viewBox="0 0 16 16">
        <rect
          x="3"
          y="3"
          width="10"
          height="10"
          rx="1.5"
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );

  const renderDeviceTop = (st: DeviceShellType) => {
    switch (st) {
      case 'iphone':
        return renderIPhoneTop();
      case 'android':
        return renderAndroidTop();
      case 'desktop-app':
        return renderDesktopAppTop();
      default:
        return renderDesktopBrowserTop();
    }
  };

  const renderDeviceBottom = (st: DeviceShellType) => {
    switch (st) {
      case 'iphone':
        return renderIPhoneBottom();
      case 'android':
        return renderAndroidBottom();
      default:
        return null;
    }
  };

  if (effects) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: bgColor,
          opacity: initialFade,
          perspective: 1200,
        }}
      >
        {/* 3D Device Shell */}
        <div
          style={{
            position: 'absolute',
            left: DEVICE_MARGIN,
            top: DEVICE_MARGIN,
            width: browserW,
            height: browserH,
            transformStyle: 'preserve-3d',
            transform: [
              `scale(${transform3d.scale})`,
              `rotateX(${transform3d.rotateX}deg)`,
              `rotateY(${transform3d.rotateY}deg)`,
              `translateZ(${transform3d.translateZ}px)`,
            ].join(' '),
            borderRadius: deviceLayout.borderRadius,
            overflow: 'hidden',
            boxShadow: [
              '0 20px 60px rgba(0,0,0,0.6)',
              '0 0 1px rgba(0,255,255,0.3)',
              '0 0 30px rgba(0,255,255,0.08)',
            ].join(', '),
          }}
        >
          {renderDeviceTop(shellType)}
          {renderContentArea(browserW, contentH)}
          {renderDeviceBottom(shellType)}

          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: deviceLayout.borderRadius,
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

        {/* AI prompt indicator */}
        {(title || subTitle) && (
          <div
            style={{
              position: 'absolute',
              bottom: DEVICE_MARGIN + 8,
              left: DEVICE_MARGIN,
              right: DEVICE_MARGIN,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              padding: '6px 10px',
              background: 'rgba(0, 10, 20, 0.75)',
              backdropFilter: 'blur(8px)',
              borderRadius: 6,
              border: '1px solid rgba(0, 255, 255, 0.15)',
              zIndex: 10,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#fff',
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                padding: '2px 5px',
                borderRadius: 3,
                letterSpacing: 0.5,
                lineHeight: '14px',
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              AI
            </span>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              {title && (
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textShadow: '0 0 6px rgba(0,255,255,0.4)',
                  }}
                >
                  {title}
                </div>
              )}
              {subTitle && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.6)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: 1,
                  }}
                >
                  {subTitle}
                </div>
              )}
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
      <div
        style={{
          width: compWidth,
          height: compHeight,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
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

        {/* AI prompt indicator */}
        {(title || subTitle) && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              right: 8,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              padding: '6px 10px',
              background: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(8px)',
              borderRadius: 6,
              border: '1px solid rgba(0, 0, 0, 0.08)',
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.08)',
              zIndex: 10,
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#fff',
                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                padding: '2px 5px',
                borderRadius: 3,
                letterSpacing: 0.5,
                lineHeight: '14px',
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              AI
            </span>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              {title && (
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#1a1a1a',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {title}
                </div>
              )}
              {subTitle && (
                <div
                  style={{
                    fontSize: 11,
                    color: '#666',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: 1,
                  }}
                >
                  {subTitle}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
