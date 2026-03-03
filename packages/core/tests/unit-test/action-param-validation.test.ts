import { getMidsceneLocationSchema, parseActionParam } from '@/ai-model';
import { actionKeyboardPressParamSchema, defineAction } from '@/device';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('Action Parameter Validation', () => {
  describe('parseActionParam', () => {
    it('should apply default values for optional parameters', () => {
      const schema = z.object({
        value: z.string(),
        append: z.boolean().optional().default(false),
      });

      const rawParam = {
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema);

      expect(parsed).toEqual({
        value: 'test',
        append: false, // Default value should be applied
      });
    });

    it('should validate required parameters', () => {
      const schema = z.object({
        value: z.string(),
        count: z.number(),
      });

      const rawParam = {
        value: 'test',
        // count is missing
      };

      expect(() => parseActionParam(rawParam, schema)).toThrow();
    });

    it('should validate parameter types', () => {
      const schema = z.object({
        value: z.string(),
        count: z.number(),
      });

      const rawParam = {
        value: 'test',
        count: 'invalid', // Wrong type
      };

      expect(() => parseActionParam(rawParam, schema)).toThrow();
    });

    it('should keep locator fields as-is without parsing', () => {
      const schema = z.object({
        locate: getMidsceneLocationSchema().describe('The element to locate'),
        value: z.string(),
      });

      const rawParam = {
        locate: {
          prompt: 'button',
          deepLocate: true,
        },
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema);

      // Locator field should not be parsed/validated
      expect(parsed.locate).toEqual({
        prompt: 'button',
        deepLocate: true,
      });
      expect(parsed.value).toBe('test');
    });

    it('should handle optional locator fields', () => {
      const schema = z.object({
        locate: getMidsceneLocationSchema()
          .optional()
          .describe('Optional element'),
        value: z.string(),
      });

      const rawParam = {
        value: 'test',
        // locate is omitted
      };

      const parsed = parseActionParam(rawParam, schema);

      expect(parsed).toEqual({
        value: 'test',
      });
    });

    it('should apply defaults for non-locator fields while preserving locator fields', () => {
      const schema = z.object({
        locate: getMidsceneLocationSchema().describe('The element to locate'),
        value: z.string(),
        append: z.boolean().optional().default(false),
        retry: z.number().optional().default(3),
      });

      const rawParam = {
        locate: { prompt: 'button' },
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema);

      expect(parsed).toEqual({
        locate: { prompt: 'button' }, // Kept as-is
        value: 'test',
        append: false, // Default applied
        retry: 3, // Default applied
      });
    });

    it('should validate enum values', () => {
      const schema = z.object({
        direction: z.enum(['up', 'down', 'left', 'right']).default('down'),
        value: z.string(),
      });

      const rawParam = {
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema);

      expect(parsed).toEqual({
        direction: 'down', // Default enum value
        value: 'test',
      });
    });

    it('should throw error for invalid enum values', () => {
      const schema = z.object({
        direction: z.enum(['up', 'down', 'left', 'right']),
        value: z.string(),
      });

      const rawParam = {
        direction: 'invalid',
        value: 'test',
      };

      expect(() => parseActionParam(rawParam, schema)).toThrow();
    });

    it('should handle complex schemas with multiple locator and non-locator fields', () => {
      const schema = z.object({
        from: getMidsceneLocationSchema().describe('Start position'),
        to: getMidsceneLocationSchema().describe('End position'),
        speed: z.number().optional().default(100),
        smooth: z.boolean().optional().default(true),
        value: z.string(),
      });

      const rawParam = {
        from: { prompt: 'element1' },
        to: { prompt: 'element2' },
        value: 'drag',
      };

      const parsed = parseActionParam(rawParam, schema);

      expect(parsed).toEqual({
        from: { prompt: 'element1' }, // Kept as-is
        to: { prompt: 'element2' }, // Kept as-is
        speed: 100, // Default applied
        smooth: true, // Default applied
        value: 'drag',
      });
    });

    it('should handle schema with only locator fields', () => {
      const schema = z.object({
        locate: getMidsceneLocationSchema().describe('The element'),
      });

      const rawParam = {
        locate: { prompt: 'button', cacheable: false },
      };

      const parsed = parseActionParam(rawParam, schema);

      expect(parsed).toEqual({
        locate: { prompt: 'button', cacheable: false },
      });
    });

    it('should validate number constraints', () => {
      const schema = z.object({
        duration: z.number().min(0).max(1000).default(500),
        value: z.string(),
      });

      const rawParam = {
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema);

      expect(parsed.duration).toBe(500);
    });

    it('should throw error for out-of-range numbers', () => {
      const schema = z.object({
        duration: z.number().min(0).max(1000),
        value: z.string(),
      });

      const rawParam = {
        duration: 1500, // Out of range
        value: 'test',
      };

      expect(() => parseActionParam(rawParam, schema)).toThrow();
    });

    it('should handle nullable optional fields', () => {
      const schema = z.object({
        distance: z.number().nullable().optional(),
        value: z.string(),
      });

      const rawParam = {
        distance: null,
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema);

      expect(parsed).toEqual({
        distance: null,
        value: 'test',
      });
    });

    it('should work with defineAction helper', () => {
      const action = defineAction({
        name: 'Input',
        description: 'Input text',
        paramSchema: z.object({
          value: z.string().describe('The value to input'),
          locate: getMidsceneLocationSchema()
            .optional()
            .describe('The element to input'),
          append: z
            .boolean()
            .optional()
            .default(false)
            .describe('Append instead of replace'),
        }),
        call: async () => {
          // Mock implementation
        },
      });

      const rawParam = {
        value: 'hello',
      };

      const parsed = parseActionParam(rawParam, action.paramSchema);

      expect(parsed).toEqual({
        value: 'hello',
        append: false, // Default should be applied
      });
    });

    it('should skip validation for locate fields (pass through as-is)', () => {
      const schema = z.object({
        locate: getMidsceneLocationSchema().describe('The element to tap'),
        value: z.string(),
      });

      // Locate field with LocateResultElement structure (already processed by AI)
      const rawParam = {
        locate: {
          center: [100, 200] as [number, number],
          rect: { left: 50, top: 150, width: 100, height: 100 },
          id: 'elem-123',
          attributes: { nodeType: 'BUTTON', class: 'btn' },
          // Any structure is allowed - no validation for locate fields
        },
        value: 'test',
      };

      // Should not throw - locate fields are not validated
      const parsed = parseActionParam(rawParam, schema);

      // Locate field should be passed through unchanged
      expect(parsed.locate).toEqual(rawParam.locate);
      expect(parsed.value).toBe('test');
    });

    it('should skip validation for locate fields even with missing fields', () => {
      const schema = z.object({
        locate: getMidsceneLocationSchema().describe('The element to tap'),
        value: z.string(),
      });

      // Locate field with incomplete structure - normally would fail validation
      // But since we skip validation for locate fields, it passes through
      const rawParam = {
        locate: {
          center: [100, 200] as [number, number],
          // Missing other fields like rect, id, etc.
        },
        value: 'test',
      };

      // Should not throw - locate fields are not validated
      const parsed = parseActionParam(rawParam, schema);

      expect(parsed.locate).toEqual(rawParam.locate);
      expect(parsed.value).toBe('test');
    });

    it('should transform locate field coordinates when shrunkShotToLogicalRatio !== 1', () => {
      const schema = z.object({
        locate: getMidsceneLocationSchema().describe('The element to tap'),
        value: z.string(),
      });

      const rawParam = {
        locate: {
          center: [200, 400] as [number, number],
          rect: { left: 100, top: 300, width: 200, height: 200 },
          description: 'button',
        },
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema, {
        shrunkShotToLogicalRatio: 2,
      });

      expect(parsed.locate).toEqual({
        center: [100, 200],
        rect: { left: 50, top: 150, width: 100, height: 100 },
        description: 'button',
      });
      expect(parsed.value).toBe('test');
    });

    it('should not transform coordinates when shrunkShotToLogicalRatio is 1', () => {
      const schema = z.object({
        locate: getMidsceneLocationSchema().describe('The element'),
        value: z.string(),
      });

      const rawParam = {
        locate: {
          center: [200, 400] as [number, number],
          rect: { left: 100, top: 300, width: 200, height: 200 },
          description: 'button',
        },
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema, {
        shrunkShotToLogicalRatio: 1,
      });

      expect(parsed.locate).toEqual(rawParam.locate);
    });

    it('should not transform coordinates when shrunkShotToLogicalRatio is not provided', () => {
      const schema = z.object({
        locate: getMidsceneLocationSchema().describe('The element'),
        value: z.string(),
      });

      const rawParam = {
        locate: {
          center: [200, 400] as [number, number],
          rect: { left: 100, top: 300, width: 200, height: 200 },
          description: 'button',
        },
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema);

      expect(parsed.locate).toEqual(rawParam.locate);
    });

    it('should transform multiple locate fields with shrunkShotToLogicalRatio', () => {
      const schema = z.object({
        from: getMidsceneLocationSchema().describe('Start position'),
        to: getMidsceneLocationSchema().describe('End position'),
        value: z.string(),
      });

      const rawParam = {
        from: {
          center: [200, 400] as [number, number],
          rect: { left: 100, top: 300, width: 200, height: 200 },
          description: 'start',
        },
        to: {
          center: [600, 800] as [number, number],
          rect: { left: 500, top: 700, width: 200, height: 200 },
          description: 'end',
        },
        value: 'drag',
      };

      const parsed = parseActionParam(rawParam, schema, {
        shrunkShotToLogicalRatio: 2,
      });

      expect(parsed.from).toEqual({
        center: [100, 200],
        rect: { left: 50, top: 150, width: 100, height: 100 },
        description: 'start',
      });
      expect(parsed.to).toEqual({
        center: [300, 400],
        rect: { left: 250, top: 350, width: 100, height: 100 },
        description: 'end',
      });
    });

    it('should skip coordinate transform for locate fields without center/rect', () => {
      const schema = z.object({
        locate: getMidsceneLocationSchema().describe('The element'),
        value: z.string(),
      });

      const rawParam = {
        locate: {
          prompt: 'some button',
          deepThink: true,
        },
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema, {
        shrunkShotToLogicalRatio: 2,
      });

      // Should pass through as-is since there's no center/rect to transform
      expect(parsed.locate).toEqual({
        prompt: 'some button',
        deepThink: true,
      });
    });
  });

  describe('KeyboardPress Action', () => {
    it('should accept keyName as a string', () => {
      const rawParam = {
        keyName: 'Enter',
      };

      const parsed = parseActionParam(rawParam, actionKeyboardPressParamSchema);

      expect(parsed).toEqual({
        keyName: 'Enter',
      });
    });

    it('should accept keyName as key combination string', () => {
      const rawParam = {
        keyName: 'Control+A',
      };

      const parsed = parseActionParam(rawParam, actionKeyboardPressParamSchema);

      expect(parsed).toEqual({
        keyName: 'Control+A',
      });
    });

    it('should accept keyName with optional locate parameter', () => {
      const rawParam = {
        keyName: 'Control+V',
        locate: {
          prompt: 'text input field',
          deepLocate: false,
        },
      };

      const parsed = parseActionParam(rawParam, actionKeyboardPressParamSchema);

      expect(parsed.keyName).toEqual('Control+V');
      expect(parsed.locate).toEqual({
        prompt: 'text input field',
        deepLocate: false,
      });
    });

    it('should reject keyName with invalid type', () => {
      const rawParam = {
        keyName: 123, // Invalid type
      };

      expect(() =>
        parseActionParam(rawParam, actionKeyboardPressParamSchema),
      ).toThrow();
    });

    it('should reject keyName as array', () => {
      const rawParam = {
        keyName: ['Control', 'A'], // Arrays not supported
      };

      expect(() =>
        parseActionParam(rawParam, actionKeyboardPressParamSchema),
      ).toThrow();
    });
  });

  describe('Actions without paramSchema', () => {
    it('should return undefined when paramSchema is not provided', () => {
      const result = parseActionParam({ some: 'data' }, undefined);
      expect(result).toBeUndefined();
    });

    it('should return undefined even when rawParam is undefined', () => {
      const result = parseActionParam(undefined, undefined);
      expect(result).toBeUndefined();
    });

    it('should work with defineAction when paramSchema is omitted', () => {
      const action = defineAction({
        name: 'AndroidBackButton',
        description: 'Trigger the system "back" operation',
        call: async () => {
          // Mock implementation
        },
      });

      // paramSchema should be undefined
      expect(action.paramSchema).toBeUndefined();

      // parseActionParam should return undefined
      const parsed = parseActionParam({}, action.paramSchema);
      expect(parsed).toBeUndefined();
    });

    it('should work with defineAction and explicit undefined paramSchema', () => {
      const action = defineAction<undefined, undefined>({
        name: 'HomeButton',
        description: 'Go to home',
        call: async () => {
          // Mock implementation
        },
      });

      expect(action.paramSchema).toBeUndefined();
    });
  });
});
