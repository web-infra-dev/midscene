import type { PointerPoint } from './index';

/**
 * Resolve the default untargeted mobile scroll gesture in screen coordinates.
 * The finger crosses the central 70% opposite the requested content direction.
 * Native adapters own timing, coordinate conversion, and gesture execution.
 */
export function resolveDefaultMobileScroll(
  direction: 'up' | 'down' | 'left' | 'right',
  size: { width: number; height: number },
): { from: PointerPoint; to: PointerPoint } {
  const { width, height } = size;
  const horizontal = direction === 'left' || direction === 'right';
  const forward = direction === 'down' || direction === 'right';
  const extent = horizontal ? width : height;
  const start = Math.round(extent * (forward ? 0.85 : 1 - 0.85));
  const end = Math.round(extent * (forward ? 1 - 0.85 : 0.85));
  const from = { x: Math.round(width / 2), y: Math.round(height / 2) };
  const to = { ...from };
  if (horizontal) {
    from.x = start;
    to.x = end;
  } else {
    from.y = start;
    to.y = end;
  }
  return { from, to };
}
