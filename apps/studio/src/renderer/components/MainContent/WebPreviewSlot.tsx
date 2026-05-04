import { useEffect, useRef } from 'react';

/**
 * Renders an empty placeholder div whose bounding rect is forwarded to the
 * main process so the embedded WebContentsView visually tracks this slot.
 *
 * The visible "preview" the user sees is the native WebContentsView itself
 * — this React tree only serves as a positional anchor.
 */
export function WebPreviewSlot() {
  const slotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = slotRef.current;
    const studioRuntime = window.studioRuntime;
    if (!node || !studioRuntime) {
      return;
    }

    const pushBounds = () => {
      const rect = node.getBoundingClientRect();
      void studioRuntime.setWebPreviewBounds({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };

    pushBounds();

    const resizeObserver = new ResizeObserver(pushBounds);
    resizeObserver.observe(node);
    window.addEventListener('resize', pushBounds);
    window.addEventListener('scroll', pushBounds, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', pushBounds);
      window.removeEventListener('scroll', pushBounds, true);
      void studioRuntime.hideWebPreview();
    };
  }, []);

  return (
    <div
      aria-label="Web preview"
      className="h-full w-full"
      ref={slotRef}
      role="presentation"
    />
  );
}
