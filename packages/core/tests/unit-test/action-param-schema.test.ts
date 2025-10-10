import { describe, expect, it } from 'vitest';
import {
  ActionSwipeParamSchema,
  actionScrollParamSchema,
} from '../../src/device';

describe('Action Parameter Schema', () => {
  describe('actionScrollParamSchema distance parsing', () => {
    it('should accept numeric distance', () => {
      const result = actionScrollParamSchema.parse({
        direction: 'up',
        scrollType: 'once',
        distance: 200,
      });
      expect(result.distance).toBe(200);
    });

    it('should parse distance with px suffix', () => {
      const result = actionScrollParamSchema.parse({
        direction: 'up',
        scrollType: 'once',
        distance: '200px',
      });
      expect(result.distance).toBe(200);
    });

    it('should parse distance with PX suffix (case insensitive)', () => {
      const result = actionScrollParamSchema.parse({
        direction: 'up',
        scrollType: 'once',
        distance: '200PX',
      });
      expect(result.distance).toBe(200);
    });

    it('should parse distance with px suffix and spaces', () => {
      const result = actionScrollParamSchema.parse({
        direction: 'up',
        scrollType: 'once',
        distance: '200 px',
      });
      expect(result.distance).toBe(200);
    });

    it('should parse float distance with px suffix', () => {
      const result = actionScrollParamSchema.parse({
        direction: 'up',
        scrollType: 'once',
        distance: '150.5px',
      });
      expect(result.distance).toBe(150.5);
    });

    it('should parse numeric string without px suffix', () => {
      const result = actionScrollParamSchema.parse({
        direction: 'up',
        scrollType: 'once',
        distance: '200',
      });
      expect(result.distance).toBe(200);
    });

    it('should handle null distance', () => {
      const result = actionScrollParamSchema.parse({
        direction: 'up',
        scrollType: 'once',
        distance: null,
      });
      expect(result.distance).toBeUndefined();
    });

    it('should handle undefined distance', () => {
      const result = actionScrollParamSchema.parse({
        direction: 'up',
        scrollType: 'once',
      });
      expect(result.distance).toBeUndefined();
    });

    it('should return undefined for invalid distance format', () => {
      // Mock console.warn to avoid noise in test output
      const originalWarn = console.warn;
      console.warn = () => {};

      const result = actionScrollParamSchema.parse({
        direction: 'up',
        scrollType: 'once',
        distance: 'invalid',
      });
      expect(result.distance).toBeUndefined();

      console.warn = originalWarn;
    });
  });

  describe('ActionSwipeParamSchema distance parsing', () => {
    it('should accept numeric distance', () => {
      const result = ActionSwipeParamSchema.parse({
        direction: 'up',
        distance: 200,
      });
      expect(result.distance).toBe(200);
    });

    it('should parse distance with px suffix', () => {
      const result = ActionSwipeParamSchema.parse({
        direction: 'up',
        distance: '200px',
      });
      expect(result.distance).toBe(200);
    });

    it('should parse distance with PX suffix (case insensitive)', () => {
      const result = ActionSwipeParamSchema.parse({
        direction: 'up',
        distance: '300PX',
      });
      expect(result.distance).toBe(300);
    });

    it('should parse float distance with px suffix', () => {
      const result = ActionSwipeParamSchema.parse({
        direction: 'up',
        distance: '250.75px',
      });
      expect(result.distance).toBe(250.75);
    });

    it('should handle undefined distance', () => {
      const result = ActionSwipeParamSchema.parse({
        direction: 'up',
      });
      expect(result.distance).toBeUndefined();
    });
  });
});
