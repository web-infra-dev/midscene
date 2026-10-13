import { type RefObject, useEffect, useState } from 'react';

/** Observe the clipped viewport so expanded but offscreen case rows do not preload images. */
export function useTimelineViewport(
  ref: RefObject<HTMLElement>,
  enabled: boolean,
) {
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const track = ref.current;
    if (!track || !enabled) {
      setVisible(false);
      setWidth(0);
      return;
    }
    const measure = () => setWidth(track.clientWidth);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(track);
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(track);
    return () => {
      resize.disconnect();
      observer.disconnect();
    };
  }, [ref, enabled]);
  return { visible, width };
}
