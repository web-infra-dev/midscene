import { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { fitMobilePreviewViewport } from './preview-layout';

interface MobilePreviewFrameProps extends PropsWithChildren {
  enabled: boolean;
}

export function MobilePreviewFrame({
  children,
  enabled,
}: MobilePreviewFrameProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

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
        fitMobilePreviewViewport(stage.clientWidth, stage.clientHeight),
      );
    };

    updateViewportSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportSize);
      return () => {
        window.removeEventListener('resize', updateViewportSize);
      };
    }

    const observer = new ResizeObserver(() => {
      updateViewportSize();
    });
    observer.observe(stage);

    return () => {
      observer.disconnect();
    };
  }, [enabled]);

  const rootClassName = [
    'h-full w-full min-h-0',
    enabled &&
      'flex items-center justify-center bg-surface px-4 py-5 md:px-6 md:py-6',
  ]
    .filter(Boolean)
    .join(' ');
  const shellClassName = [
    'h-full w-full min-h-0',
    enabled && 'flex max-h-full max-w-[392px] items-center justify-center',
  ]
    .filter(Boolean)
    .join(' ');
  const stageClassName = [
    'h-full w-full min-h-0',
    enabled && 'flex items-center justify-center overflow-hidden',
  ]
    .filter(Boolean)
    .join(' ');
  const viewportClassName = enabled
    ? 'shrink-0 overflow-hidden rounded-[34px]'
    : 'h-full w-full min-h-0 overflow-hidden';
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
