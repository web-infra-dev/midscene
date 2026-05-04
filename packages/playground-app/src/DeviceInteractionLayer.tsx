import { type CSSProperties, useCallback, useEffect, useRef } from 'react';

export interface DeviceSize {
  width: number;
  height: number;
}

export interface DeviceInteractionLayerProps {
  enabled: boolean;
  deviceSize?: DeviceSize | null;
  onTap?: (point: { x: number; y: number }) => void;
  onSwipe?: (
    start: { x: number; y: number },
    end: { x: number; y: number },
    duration: number,
  ) => void;
  /**
   * Tap classification thresholds. Pointer movement below this distance and
   * total duration below this delay is reported as a Tap; anything else is a
   * Swipe.
   */
  tapMaxDistance?: number;
  tapMaxDurationMs?: number;
  style?: CSSProperties;
}

interface ActivePointer {
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
  contentRect: { left: number; top: number; width: number; height: number };
}

export function inscribedContentRect(
  panel: { left: number; top: number; width: number; height: number },
  deviceSize: DeviceSize,
) {
  const aspect = deviceSize.width / deviceSize.height;
  if (panel.height <= 0 || panel.width <= 0) return panel;
  if (panel.width / panel.height > aspect) {
    const renderedWidth = panel.height * aspect;
    return {
      left: panel.left + (panel.width - renderedWidth) / 2,
      top: panel.top,
      width: renderedWidth,
      height: panel.height,
    };
  }
  const renderedHeight = panel.width / aspect;
  return {
    left: panel.left,
    top: panel.top + (panel.height - renderedHeight) / 2,
    width: panel.width,
    height: renderedHeight,
  };
}

export function DeviceInteractionLayer({
  enabled,
  deviceSize,
  onTap,
  onSwipe,
  tapMaxDistance = 8,
  tapMaxDurationMs = 250,
  style,
}: DeviceInteractionLayerProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const activePointer = useRef<ActivePointer | null>(null);

  const projectToDevice = useCallback(
    (
      clientX: number,
      clientY: number,
      contentRect: { left: number; top: number; width: number; height: number },
    ) => {
      if (!deviceSize) return null;
      const ratioX = (clientX - contentRect.left) / contentRect.width;
      const ratioY = (clientY - contentRect.top) / contentRect.height;
      const x = Math.max(
        0,
        Math.min(deviceSize.width - 1, Math.round(ratioX * deviceSize.width)),
      );
      const y = Math.max(
        0,
        Math.min(deviceSize.height - 1, Math.round(ratioY * deviceSize.height)),
      );
      return { x, y };
    },
    [deviceSize],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || !deviceSize || !overlayRef.current) return;
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      const panelRect = overlayRef.current.getBoundingClientRect();
      const contentRect = inscribedContentRect(panelRect, deviceSize);
      if (
        event.clientX < contentRect.left ||
        event.clientX > contentRect.left + contentRect.width ||
        event.clientY < contentRect.top ||
        event.clientY > contentRect.top + contentRect.height
      ) {
        return;
      }
      overlayRef.current.setPointerCapture(event.pointerId);
      activePointer.current = {
        startX: event.clientX,
        startY: event.clientY,
        startTime: performance.now(),
        lastX: event.clientX,
        lastY: event.clientY,
        contentRect,
      };
      event.preventDefault();
    },
    [enabled, deviceSize],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const active = activePointer.current;
      if (!active) return;
      active.lastX = event.clientX;
      active.lastY = event.clientY;
    },
    [],
  );

  const finishPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const active = activePointer.current;
      activePointer.current = null;
      if (!active) return;
      try {
        overlayRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      if (cancelled) return;

      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const duration = Math.max(0, performance.now() - active.startTime);

      const startPoint = projectToDevice(
        active.startX,
        active.startY,
        active.contentRect,
      );
      const endPoint = projectToDevice(
        event.clientX,
        event.clientY,
        active.contentRect,
      );
      if (!startPoint || !endPoint) return;

      if (distance <= tapMaxDistance && duration <= tapMaxDurationMs) {
        onTap?.(startPoint);
      } else {
        onSwipe?.(startPoint, endPoint, Math.round(duration));
      }
    },
    [onTap, onSwipe, projectToDevice, tapMaxDistance, tapMaxDurationMs],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => finishPointer(event, false),
    [finishPointer],
  );
  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => finishPointer(event, true),
    [finishPointer],
  );

  useEffect(() => {
    if (!enabled) {
      activePointer.current = null;
    }
  }, [enabled]);

  if (!enabled || !deviceSize) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        cursor: 'crosshair',
        touchAction: 'none',
        userSelect: 'none',
        ...style,
      }}
    />
  );
}
