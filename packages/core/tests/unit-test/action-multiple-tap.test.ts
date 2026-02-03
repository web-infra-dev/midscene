import { describe, expect, test } from 'vitest';
import {
  actionMultipleTapParamSchema,
  defineActionMultipleTap,
} from '@/device';

describe('MultipleTap Action', () => {
  describe('actionMultipleTapParamSchema', () => {
    test('should validate valid parameters with count', () => {
      const validParams = {
        locate: {
          prompt: 'the submit button',
        },
        count: 3,
      };

      const result = actionMultipleTapParamSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    test('should validate parameters with count and interval', () => {
      const validParams = {
        locate: {
          prompt: 'the submit button',
        },
        count: 5,
        interval: 100,
      };

      const result = actionMultipleTapParamSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    test('should reject count less than 1', () => {
      const invalidParams = {
        locate: {
          prompt: 'the submit button',
        },
        count: 0,
      };

      const result = actionMultipleTapParamSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    test('should reject negative interval', () => {
      const invalidParams = {
        locate: {
          prompt: 'the submit button',
        },
        count: 2,
        interval: -50,
      };

      const result = actionMultipleTapParamSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    test('should reject missing count', () => {
      const invalidParams = {
        locate: {
          prompt: 'the submit button',
        },
      };

      const result = actionMultipleTapParamSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('defineActionMultipleTap', () => {
    test('should create action with correct name and alias', () => {
      const mockCall = async () => {};
      const action = defineActionMultipleTap(mockCall);

      expect(action.name).toBe('MultipleTap');
      expect(action.interfaceAlias).toBe('aiMultipleTap');
      expect(action.description).toBe('Tap the element multiple times');
    });

    test('should call the provided function when invoked', async () => {
      let callCount = 0;
      const mockCall = async (param: any) => {
        callCount++;
        expect(param.count).toBe(3);
        expect(param.interval).toBe(50);
      };

      const action = defineActionMultipleTap(mockCall);
      await action.call({
        locate: {
          id: 'test',
          center: [0, 0] as [number, number],
          rect: { left: 0, top: 0, width: 10, height: 10 },
        },
        count: 3,
        interval: 50,
      });

      expect(callCount).toBe(1);
    });
  });
});
