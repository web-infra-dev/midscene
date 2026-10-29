import { resolveDefaultMobileScroll } from '@/device';
import { describe, expect, it } from '@rstest/core';

describe('default mobile scroll geometry', () => {
  it.each(['up', 'down', 'left', 'right'] as const)(
    '%s stays centered and preserves overlapping travel across screen sizes',
    (direction) => {
      for (const size of [
        { width: 375, height: 812 },
        { width: 812, height: 375 },
        { width: 1024, height: 1366 },
      ]) {
        const { from, to } = resolveDefaultMobileScroll(direction, size);
        const horizontal = direction === 'left' || direction === 'right';
        const axis = horizontal ? 'x' : 'y';
        const stationary = horizontal ? 'y' : 'x';
        const extent = horizontal ? size.width : size.height;
        const crossExtent = horizontal ? size.height : size.width;
        expect(from[stationary]).toBe(Math.round(crossExtent / 2));
        expect(to[stationary]).toBe(from[stationary]);
        expect(
          Math.abs(Math.abs(to[axis] - from[axis]) - extent * 0.7),
        ).toBeLessThanOrEqual(1);
        expect(Math.sign(to[axis] - from[axis])).toBe(
          direction === 'down' || direction === 'right' ? -1 : 1,
        );
        expect(Math.min(from[axis], to[axis])).toBeGreaterThan(0);
        expect(Math.max(from[axis], to[axis])).toBeLessThan(extent);
      }
    },
  );
});
