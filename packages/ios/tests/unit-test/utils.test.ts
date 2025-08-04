import { describe, expect, it } from 'vitest';
import type { ScreenInfo } from '../../src/utils';

describe('iOS Utils', () => {
  describe('ScreenInfo interface', () => {
    it('should have correct type definition', () => {
      const screenInfo: ScreenInfo = {
        width: 1920,
        height: 1080,
        dpr: 2,
      };

      expect(screenInfo.width).toBe(1920);
      expect(screenInfo.height).toBe(1080);
      expect(screenInfo.dpr).toBe(2);
    });
  });
});
