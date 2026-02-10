import { useMemo } from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { mouseLoading } from '../../../utils';
import {
  AndroidNavBar,
  BatteryIcon,
  HudCornerBracket,
  SignalBarsIcon,
  WifiIcon,
} from './CyberOverlays';
import { deriveFrameState } from './derive-frame-state';
import type { FrameMap } from './frame-calculator';
import {
  ANDROID_NAV_BAR_H,
  ANDROID_STATUS_BAR_H,
  CHROME_DOTS,
  CHROME_TITLE_BAR_H,
  DESKTOP_APP_TITLE_BAR_H,
  type DeviceShellType,
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
  const showCursor =
    camera.pointerLeft !== Math.round(imgW / 2) ||
    camera.pointerTop !== Math.round(imgH / 2) ||
    prevCamera.pointerLeft !== Math.round(imgW / 2) ||
    prevCamera.pointerTop !== Math.round(imgH / 2);

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
    if (!showCursor || !effects || !pointerMoved) return [];
    const positions: { x: number; y: number }[] = [];
    const sf = scriptFrames[scriptIndex];
    if (!sf || sf.durationInFrames === 0) return [];
    for (let i = 0; i < 6; i++) {
      const pastLocalFrame = frameInScript - i;
      if (pastLocalFrame < 0) break;
      const pastRaw = Math.min(pastLocalFrame / sf.durationInFrames, 1);
      const pastPT = Math.min(pastRaw / POINTER_PHASE, 1);
      const pastPtrLeft =
        prevCamera.pointerLeft +
        (camera.pointerLeft - prevCamera.pointerLeft) * pastPT;
      const pastPtrTop =
        prevCamera.pointerTop +
        (camera.pointerTop - prevCamera.pointerTop) * pastPT;
      const pastCT =
        pastRaw <= POINTER_PHASE
          ? 0
          : Math.min((pastRaw - POINTER_PHASE) / (1 - POINTER_PHASE), 1);
      const pastCamLeft =
        prevCamera.left + (camera.left - prevCamera.left) * pastCT;
      const pastCamTop =
        prevCamera.top + (camera.top - prevCamera.top) * pastCT;
      const pastCamW =
        prevCamera.width + (camera.width - prevCamera.width) * pastCT;
      const pastCamH = pastCamW * (imgH / imgW);
      const x = ((pastPtrLeft - pastCamLeft) / pastCamW) * browserW;
      const y = ((pastPtrTop - pastCamTop) / pastCamH) * contentH;
      positions.push({ x, y });
    }
    return positions;
  }, [
    frame,
    showCursor,
    effects,
    pointerMoved,
    scriptFrames,
    scriptIndex,
    frameInScript,
    prevCamera,
    camera,
    imgW,
    imgH,
    browserW,
    contentH,
  ]);

  const trail =
    showCursor && pointerMoved && effects ? getCursorTrail(trailPositions) : [];

  const spinRotation = spinningPointer
    ? ((Math.sin(spinningElapsedMs / 500 - Math.PI / 2) + 1) / 2) * Math.PI * 2
    : 0;

  const bgColor = effects ? '#0a0a12' : '#f4f4f4';

  // ── Insight overlay rendering ──
  const renderInsightOverlays = () => {
    if (insights.length === 0) return null;
    return insights.map((insight, idx) => {
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

  // ── Shared content area rendering ──
  const cursorFilter = effects
    ? 'drop-shadow(0 0 4px rgba(0,255,255,0.6)) drop-shadow(0 1px 2px rgba(0,0,0,0.5))'
    : 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))';

  const renderContentArea = (w: number, h: number) => (
    <div
      style={{
        width: w,
        height: h,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: effects ? '#000' : undefined,
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

      {effects &&
        glitchSlices.map((slice, i) => (
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

      {effects &&
        trail.map((pt, i) => (
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
            filter: cursorFilter,
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
            filter: cursorFilter,
          }}
        />
      )}

      {effects && ripple.active && (
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
      {effects && ripple2.active && (
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

      {effects && (
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
      )}
    </div>
  );

  // ── Device shell renderers ──

  const trafficLights = CHROME_DOTS.map((dot) => (
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
  ));

  const titleBarBaseStyle: React.CSSProperties = {
    width: browserW,
    background: 'linear-gradient(180deg, #2a2a35 0%, #1e1e28 100%)',
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid rgba(0,255,255,0.15)',
    position: 'relative',
    flexShrink: 0,
  };

  const renderDesktopBrowserTop = () => (
    <div style={{ ...titleBarBaseStyle, height: CHROME_TITLE_BAR_H }}>
      {trafficLights}
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
    <div style={{ ...titleBarBaseStyle, height: DESKTOP_APP_TITLE_BAR_H }}>
      {trafficLights}
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
        <SignalBarsIcon barWidth={3} gap={1} />
        <WifiIcon />
        <BatteryIcon />
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
        <SignalBarsIcon barWidth={2.5} gap={1} />
        <BatteryIcon
          width={20}
          height={10}
          fillPercent={75}
          fillColor="#fff"
          borderRadius={2}
        />
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
      <AndroidNavBar />
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
          <HudCornerBracket key={i} {...c} opacity={0.3} size={16} />
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
      {renderContentArea(compWidth, compHeight)}

      {/* AI prompt indicator (clean mode) */}
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
    </AbsoluteFill>
  );
};
