import { useCallback, useLayoutEffect, useRef, useState } from 'react';

type MeasurableElement = Pick<
  HTMLElement,
  'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollWidth'
>;

export type TextTruncationMode = 'multi-line' | 'single-line';

export function isTextTruncated(
  element: MeasurableElement | null,
  mode: TextTruncationMode,
): boolean {
  if (!element) return false;

  if (mode === 'multi-line') {
    // Browsers can round the computed height of an exactly full line-clamp up
    // by 1px. Treat that as fitting so a two-line entry does not get a
    // tooltip unless text is actually hidden.
    return element.scrollHeight - element.clientHeight > 1;
  }

  return element.scrollWidth > element.clientWidth;
}

/**
 * Detect whether text hidden by its matching line-clamp or ellipsis can be
 * revealed with a tooltip. Re-check when the text or its available space
 * changes.
 */
export function useTextTruncation<T extends HTMLElement>(
  content: string,
  mode: TextTruncationMode,
) {
  const ref = useRef<T>(null);
  const [truncated, setTruncated] = useState(false);
  const update = useCallback(() => {
    setTruncated(isTextTruncated(ref.current, mode));
  }, [mode]);

  useLayoutEffect(() => {
    update();

    window.addEventListener('resize', update);
    if (typeof ResizeObserver === 'undefined' || !ref.current) {
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    return () => {
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [content, update]);

  return { ref, truncated };
}
