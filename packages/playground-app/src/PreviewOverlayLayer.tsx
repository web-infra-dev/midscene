import type { ReactNode, RefObject } from 'react';
import { useEffect, useState } from 'react';
import {
  type DeviceSize,
  inscribedContentRect,
} from './DeviceInteractionLayer';

interface ViewportRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface PreviewOverlayRenderContext {
  deviceSize: DeviceSize;
}

export interface PreviewOverlayLayerProps {
  contentRef: RefObject<HTMLElement>;
  deviceSize: DeviceSize | null;
  renderOverlay?: (context: PreviewOverlayRenderContext) => ReactNode;
  rootRef: RefObject<HTMLElement>;
}

export function relativePreviewRect(
  rootRect: ViewportRect,
  contentRect: ViewportRect,
  deviceSize: DeviceSize,
): ViewportRect {
  const screenRect = inscribedContentRect(contentRect, deviceSize);
  return {
    height: screenRect.height,
    left: screenRect.left - rootRect.left,
    top: screenRect.top - rootRect.top,
    width: screenRect.width,
  };
}

export function PreviewOverlayLayer({
  contentRef,
  deviceSize,
  renderOverlay,
  rootRef,
}: PreviewOverlayLayerProps) {
  const [rect, setRect] = useState<ViewportRect | null>(null);

  useEffect(() => {
    if (!deviceSize || !renderOverlay) {
      setRect(null);
      return;
    }
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) {
      setRect(null);
      return;
    }

    const update = () => {
      const next = relativePreviewRect(
        root.getBoundingClientRect(),
        content.getBoundingClientRect(),
        deviceSize,
      );
      setRect((current) =>
        current &&
        current.left === next.left &&
        current.top === next.top &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    };

    update();
    window.addEventListener('resize', update);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => update());
    observer?.observe(root);
    observer?.observe(content);
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [contentRef, deviceSize, renderOverlay, rootRef]);

  if (!deviceSize || !rect || !renderOverlay) return null;

  return (
    <div
      data-midscene-preview-overlay-layer="true"
      style={{
        height: rect.height,
        left: rect.left,
        pointerEvents: 'none',
        position: 'absolute',
        top: rect.top,
        width: rect.width,
        zIndex: 6,
      }}
    >
      {renderOverlay({ deviceSize })}
    </div>
  );
}
