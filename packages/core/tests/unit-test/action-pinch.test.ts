import { parseActionParam } from '@/ai-model';
import {
  ActionPinchParamSchema,
  defineActionPinch,
  normalizePinchParam,
} from '@/device';
import { describe, expect, it, vi } from 'vitest';

describe('Pinch Action Parameter Validation', () => {
  describe('ActionPinchParamSchema', () => {
    it('should accept direction "out" (zoom in)', () => {
      const parsed = parseActionParam(
        { direction: 'out' },
        ActionPinchParamSchema,
      );
      expect(parsed.direction).toBe('out');
    });

    it('should accept direction "in" (zoom out)', () => {
      const parsed = parseActionParam(
        { direction: 'in' },
        ActionPinchParamSchema,
      );
      expect(parsed.direction).toBe('in');
    });

    it('should accept custom distance', () => {
      const parsed = parseActionParam(
        { direction: 'out', distance: 300 },
        ActionPinchParamSchema,
      );
      expect(parsed.direction).toBe('out');
      expect(parsed.distance).toBe(300);
    });

    it('should accept custom duration', () => {
      const parsed = parseActionParam(
        { direction: 'out', duration: 1000 },
        ActionPinchParamSchema,
      );
      expect(parsed.duration).toBe(1000);
    });

    it('should accept locate parameter', () => {
      const parsed = parseActionParam(
        { direction: 'out', locate: { prompt: 'the map area' } },
        ActionPinchParamSchema,
      );
      expect(parsed.direction).toBe('out');
      expect(parsed.locate).toEqual({ prompt: 'the map area' });
    });

    it('should reject missing direction', () => {
      expect(() => parseActionParam({}, ActionPinchParamSchema)).toThrow();
    });

    it('should reject invalid direction', () => {
      expect(() =>
        parseActionParam({ direction: 'left' }, ActionPinchParamSchema),
      ).toThrow();
    });

    it('should reject non-positive distance', () => {
      expect(() =>
        parseActionParam(
          { direction: 'out', distance: 0 },
          ActionPinchParamSchema,
        ),
      ).toThrow();

      expect(() =>
        parseActionParam(
          { direction: 'out', distance: -100 },
          ActionPinchParamSchema,
        ),
      ).toThrow();
    });

    it('should transform locate coordinates with shrunkShotToLogicalRatio', () => {
      const parsed = parseActionParam(
        {
          direction: 'out',
          locate: {
            center: [400, 600] as [number, number],
            rect: { left: 300, top: 500, width: 200, height: 200 },
          },
        },
        ActionPinchParamSchema,
        { shrunkShotToLogicalRatio: 2 },
      );

      expect(parsed.locate).toEqual({
        center: [200, 300],
        rect: { left: 150, top: 250, width: 100, height: 100 },
      });
      expect(parsed.direction).toBe('out');
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
        direction: 'out',
        distance: 200,
      });
    });

    it('should invoke the call function with correct params', async () => {
      const callFn = vi.fn();
      const action = defineActionPinch(callFn);

      await action.call({ direction: 'out', duration: 500 }, {} as any);

      expect(callFn).toHaveBeenCalledTimes(1);
      expect(callFn.mock.calls[0][0]).toEqual({
        direction: 'out',
        duration: 500,
      });
    });
  });

  describe('normalizePinchParam', () => {
    const screenSize = { width: 400, height: 800 };
    // baseDistance = Math.round(Math.min(400, 800) / 4) = 100

    it('should compute center from screen size when no locate', () => {
      const result = normalizePinchParam({ direction: 'out' }, screenSize);
      expect(result.centerX).toBe(200);
      expect(result.centerY).toBe(400);
    });

    it('should use element center when locate is provided', () => {
      const result = normalizePinchParam(
        { direction: 'out', locate: { center: [100, 300] } as any },
        screenSize,
      );
      expect(result.centerX).toBe(100);
      expect(result.centerY).toBe(300);
    });

    it('should spread fingers for direction "out"', () => {
      const result = normalizePinchParam({ direction: 'out' }, screenSize);
      // default distance = baseDistance = 100
      expect(result.startDistance).toBe(100);
      expect(result.endDistance).toBe(200); // 100 + 100
    });

    it('should close fingers for direction "in"', () => {
      const result = normalizePinchParam({ direction: 'in' }, screenSize);
      // default distance = baseDistance = 100
      expect(result.startDistance).toBe(100);
      expect(result.endDistance).toBe(10); // max(10, 100 - 100) clamped to 10
    });

    it('should use custom distance for "out"', () => {
      const result = normalizePinchParam(
        { direction: 'out', distance: 200 },
        screenSize,
      );
      expect(result.startDistance).toBe(100);
      expect(result.endDistance).toBe(300); // 100 + 200
    });

    it('should use custom distance for "in"', () => {
      const result = normalizePinchParam(
        { direction: 'in', distance: 50 },
        screenSize,
      );
      expect(result.startDistance).toBe(100);
      expect(result.endDistance).toBe(50); // max(10, 100 - 50) = 50
    });

    it('should clamp endDistance to minimum 10 for "in"', () => {
      const result = normalizePinchParam(
        { direction: 'in', distance: 500 },
        screenSize,
      );
      expect(result.startDistance).toBe(100);
      expect(result.endDistance).toBe(10); // max(10, 100 - 500) clamped
    });

    it('should default duration to 500ms', () => {
      const result = normalizePinchParam({ direction: 'out' }, screenSize);
      expect(result.duration).toBe(500);
    });

    it('should use custom duration', () => {
      const result = normalizePinchParam(
        { direction: 'out', duration: 1000 },
        screenSize,
      );
      expect(result.duration).toBe(1000);
    });
  });
});
