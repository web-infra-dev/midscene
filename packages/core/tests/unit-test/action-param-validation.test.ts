import { getMidsceneLocationSchema, parseActionParam } from '@/ai-model';
import { defineAction } from '@/device';
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
          deepThink: true,
        },
        value: 'test',
      };

      const parsed = parseActionParam(rawParam, schema);

      // Locator field should not be parsed/validated
      expect(parsed.locate).toEqual({
        prompt: 'button',
        deepThink: true,
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
        call: async (param) => {
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
  });
});
