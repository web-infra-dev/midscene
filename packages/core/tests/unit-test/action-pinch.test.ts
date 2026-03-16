import { parseActionParam } from '@/ai-model';
import {
  ActionPinchParamSchema,
  defineActionPinch,
  normalizePinchParam,
} from '@/device';
import { describe, expect, it, vi } from 'vitest';

describe('Pinch Action Parameter Validation', () => {
  describe('ActionPinchParamSchema', () => {
    it('should accept valid pinch params with scale > 1 (zoom in)', () => {
      const rawParam = {
        scale: 2,
      };

      const parsed = parseActionParam(rawParam, ActionPinchParamSchema);

      expect(parsed.scale).toBe(2);
    });

    it('should accept valid pinch params with scale < 1 (zoom out)', () => {
      const rawParam = {
        scale: 0.5,
      };

      const parsed = parseActionParam(rawParam, ActionPinchParamSchema);

      expect(parsed.scale).toBe(0.5);
    });

    it('should accept custom duration', () => {
      const rawParam = {
        scale: 2,
        duration: 1000,
      };

      const parsed = parseActionParam(rawParam, ActionPinchParamSchema);

      expect(parsed.scale).toBe(2);
      expect(parsed.duration).toBe(1000);
    });

    it('should accept locate parameter', () => {
      const rawParam = {
        scale: 2,
        locate: {
          prompt: 'the map area',
        },
      };

      const parsed = parseActionParam(rawParam, ActionPinchParamSchema);

      expect(parsed.scale).toBe(2);
      expect(parsed.locate).toEqual({ prompt: 'the map area' });
    });

    it('should accept optional locate as undefined', () => {
      const rawParam = {
        scale: 1.5,
      };

      const parsed = parseActionParam(rawParam, ActionPinchParamSchema);

      expect(parsed.scale).toBe(1.5);
      expect(parsed.locate).toBeUndefined();
    });

    it('should reject missing scale parameter', () => {
      const rawParam = {};

      expect(() =>
        parseActionParam(rawParam, ActionPinchParamSchema),
      ).toThrow();
    });

    it('should reject non-number scale', () => {
      const rawParam = {
        scale: 'big' as any,
      };

      expect(() =>
        parseActionParam(rawParam, ActionPinchParamSchema),
      ).toThrow();
    });

    it('should reject scale <= 0', () => {
      expect(() =>
        parseActionParam({ scale: 0 }, ActionPinchParamSchema),
      ).toThrow();

      expect(() =>
        parseActionParam({ scale: -1 }, ActionPinchParamSchema),
      ).toThrow();
    });

    it('should transform locate coordinates with shrunkShotToLogicalRatio', () => {
      const rawParam = {
        scale: 2,
        locate: {
          center: [400, 600] as [number, number],
          rect: { left: 300, top: 500, width: 200, height: 200 },
        },
      };

      const parsed = parseActionParam(rawParam, ActionPinchParamSchema, {
        shrunkShotToLogicalRatio: 2,
      });

      expect(parsed.locate).toEqual({
        center: [200, 300],
        rect: { left: 150, top: 250, width: 100, height: 100 },
      });
      expect(parsed.scale).toBe(2);
    });
  });

  describe('defineActionPinch', () => {
    it('should create an action with correct name and alias', () => {
      const callFn = vi.fn();
      const action = defineActionPinch(callFn);

      expect(action.name).toBe('Pinch');
      expect(action.interfaceAlias).toBe('aiPinch');
      expect(action.paramSchema).toBeDefined();
      expect(action.sample).toEqual({
        locate: { prompt: 'the map area' },
        scale: 2,
      });
    });

    it('should invoke the call function with correct params', async () => {
      const callFn = vi.fn();
      const action = defineActionPinch(callFn);

      await action.call({ scale: 2, duration: 500 }, {} as any);

      expect(callFn).toHaveBeenCalledTimes(1);
      expect(callFn.mock.calls[0][0]).toEqual({ scale: 2, duration: 500 });
    });
  });

  describe('normalizePinchParam', () => {
    const screenSize = { width: 400, height: 800 };

    it('should compute center from screen size when no locate', () => {
      const result = normalizePinchParam({ scale: 2 }, screenSize);

      expect(result.centerX).toBe(200);
      expect(result.centerY).toBe(400);
    });

    it('should use element center when locate is provided', () => {
      const result = normalizePinchParam(
        {
          scale: 2,
          locate: { center: [100, 300] } as any,
        },
        screenSize,
      );

      expect(result.centerX).toBe(100);
      expect(result.centerY).toBe(300);
    });

    it('should compute distances based on scale', () => {
      const result = normalizePinchParam({ scale: 2 }, screenSize);

      // baseDistance = Math.round(Math.min(400, 800) / 4) = 100
      expect(result.startDistance).toBe(100);
      expect(result.endDistance).toBe(200); // 100 * 2
    });

    it('should handle scale < 1 (zoom out)', () => {
      const result = normalizePinchParam({ scale: 0.5 }, screenSize);

      expect(result.startDistance).toBe(100);
      expect(result.endDistance).toBe(50); // 100 * 0.5
    });

    it('should default duration to 500ms', () => {
      const result = normalizePinchParam({ scale: 2 }, screenSize);
      expect(result.duration).toBe(500);
    });

    it('should use custom duration', () => {
      const result = normalizePinchParam(
        { scale: 2, duration: 1000 },
        screenSize,
      );
      expect(result.duration).toBe(1000);
    });
  });
});
