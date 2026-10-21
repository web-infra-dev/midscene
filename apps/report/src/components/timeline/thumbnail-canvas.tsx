import { useEffect, useLayoutEffect, useRef } from 'react';
import type { TimelineThumbnail } from './timeline-images';

const useBrowserLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Draw prepared pixels before the browser paints the newly published image group. */
export function ThumbnailCanvas({
  thumbnail,
  label,
}: { thumbnail: TimelineThumbnail; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useBrowserLayoutEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context) throw new Error('Unable to draw timeline thumbnail');
    context.drawImage(thumbnail.canvas, 0, 0);
  }, [thumbnail]);
  return (
    <canvas
      ref={ref}
      width={thumbnail.width}
      height={thumbnail.height}
      role="img"
      aria-label={label}
    />
  );
}
