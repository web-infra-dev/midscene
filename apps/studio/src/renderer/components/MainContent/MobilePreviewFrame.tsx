import { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { fitMobilePreviewViewport } from './preview-layout';
import './MobilePreviewFrame.css';

const MOBILE_PREVIEW_IDEAL_HEIGHT_PX = 716;
const MOBILE_PREVIEW_DEFAULT_ASPECT_RATIO = 9 / 19.5;

interface MobilePreviewFrameProps extends PropsWithChildren {
  enabled: boolean;
  highlightActive: boolean;
  /**
   * Width-over-height ratio of the connected device's actual screen.
   * Passed in by MainContent once the playground reports the device
   * size, so the viewport tracks reality instead of a hardcoded
   * 9:19.5 assumption. Falls back to the default when undefined.
   */
  aspectRatio?: number;
}

export function MobilePreviewFrame({
  children,
  enabled,
  highlightActive,
  aspectRatio,
}: MobilePreviewFrameProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const safeAspectRatio =
    typeof aspectRatio === 'number' &&
    Number.isFinite(aspectRatio) &&
    aspectRatio > 0
      ? aspectRatio
      : MOBILE_PREVIEW_DEFAULT_ASPECT_RATIO;

  useEffect(() => {
    if (!enabled) {
      setViewportSize({ width: 0, height: 0 });
      return;
    }

    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize(
        fitMobilePreviewViewport(
          stage.clientWidth,
          stage.clientHeight,
          safeAspectRatio,
          { maxHeight: MOBILE_PREVIEW_IDEAL_HEIGHT_PX },
        ),
      );
    };

    updateViewportSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportSize);
      return () => {
        window.removeEventListener('resize', updateViewportSize);
      };
    }

    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(stage);

    return () => {
      observer.disconnect();
    };
  }, [enabled, safeAspectRatio]);

  const rootClassName = [
    'h-full w-full min-h-0',
    enabled &&
      'flex items-center justify-center bg-surface px-4 py-5 md:px-6 md:py-6',
  ]
    .filter(Boolean)
    .join(' ');
  const shellClassName = [
    'h-full w-full min-h-0',
    enabled && 'flex max-h-full items-center justify-center',
  ]
    .filter(Boolean)
    .join(' ');
  const stageClassName = [
    'mobile-preview-frame-stage',
    'h-full w-full min-h-0',
    enabled && 'flex items-center justify-center overflow-visible',
  ]
    .filter(Boolean)
    .join(' ');
  const viewportClassName = [
    'mobile-preview-frame-viewport',
    highlightActive ? 'mobile-preview-frame-viewport-active' : '',
    enabled
      ? 'relative shrink-0 translate-y-[-18px] overflow-visible rounded-[12px]'
      : 'relative h-full w-full min-h-0 overflow-visible rounded-[12px]',
  ]
    .filter(Boolean)
    .join(' ');
  const viewportStyle = enabled
    ? viewportSize.width > 0 && viewportSize.height > 0
      ? {
          width: `${viewportSize.width}px`,
          height: `${viewportSize.height}px`,
        }
      : undefined
    : undefined;

  return (
    <div className={rootClassName}>
      <div className={shellClassName}>
        <div className={stageClassName} ref={stageRef}>
          <div className={viewportClassName} style={viewportStyle}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
