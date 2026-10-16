import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';

const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 240;
// Leave room for the embedded trace sidebar, resize handle, and Player.
const MIN_DETAIL_WIDTH = 616;
const HANDLE_WIDTH = 8;

export function executionSidebarBounds(layoutWidth: number) {
  return {
    min: MIN_WIDTH,
    max: Math.max(MIN_WIDTH, layoutWidth - MIN_DETAIL_WIDTH - HANDLE_WIDTH),
  };
}

export function clampExecutionSidebar(width: number, layoutWidth: number) {
  const { min, max } = executionSidebarBounds(layoutWidth);
  return Math.min(max, Math.max(min, width));
}

export function useExecutionSidebar(body: RefObject<HTMLDivElement>) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [layoutWidth, setLayoutWidth] = useState(0);
  const drag = useRef<{ pointerId: number; x: number; width: number }>();

  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width;
      if (!available) return;
      setLayoutWidth(available);
      // The sidebar stacks on small screens; retain its desktop width there.
      if (window.matchMedia('(max-width: 980px)').matches) return;
      setWidth((current) => clampExecutionSidebar(current, available));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [body]);

  const resize = (next: number) =>
    setWidth(clampExecutionSidebar(next, layoutWidth));

  return {
    style: { '--runner-step-sidebar-width': `${width}px` } as CSSProperties,
    handleProps: {
      role: 'separator',
      'aria-label': 'Resize execution steps',
      title: 'Drag or use arrow keys to resize. Double-click to reset.',
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': MIN_WIDTH,
      'aria-valuemax': layoutWidth
        ? executionSidebarBounds(layoutWidth).max
        : undefined,
      'aria-valuenow': Math.round(width),
      tabIndex: 0,
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const start = drag.current;
        if (!start || start.pointerId !== event.pointerId) return;
        resize(start.width + event.clientX - start.x);
      },
      onPointerUp(event: PointerEvent<HTMLDivElement>) {
        if (drag.current?.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        drag.current = undefined;
      },
      onLostPointerCapture() {
        drag.current = undefined;
      },
      onPointerCancel() {
        drag.current = undefined;
      },
      onDoubleClick() {
        resize(DEFAULT_WIDTH);
      },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        const { min, max } = executionSidebarBounds(layoutWidth);
        resize(
          event.key === 'Home'
            ? min
            : event.key === 'End'
              ? max
              : width + (event.key === 'ArrowLeft' ? -24 : 24),
        );
      },
    },
  };
}
