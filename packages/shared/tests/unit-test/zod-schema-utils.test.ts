import {
  getZodDescription,
  getZodTypeName,
  isMidsceneLocatorField,
  unwrapZodField,
} from '@/zod-schema-utils';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('zod-schema-utils', () => {
  describe('unwrapZodField', () => {
    it('should unwrap ZodOptional', () => {
      const schema = z.string().optional();
      const unwrapped = unwrapZodField(schema) as any;
      expect(unwrapped._def?.typeName).toBe('ZodString');
    });

    it('should unwrap ZodNullable', () => {
      const schema = z.string().nullable();
      const unwrapped = unwrapZodField(schema) as any;
      expect(unwrapped._def?.typeName).toBe('ZodString');
    });

    it('should unwrap ZodDefault', () => {
      const schema = z.string().default('test');
      const unwrapped = unwrapZodField(schema) as any;
      expect(unwrapped._def?.typeName).toBe('ZodString');
    });

    it('should unwrap ZodEffects (z.preprocess)', () => {
      const schema = z.preprocess(
        (val) => (typeof val === 'string' ? val.toUpperCase() : val),
        z.string(),
      );
      const unwrapped = unwrapZodField(schema) as any;
      expect(unwrapped._def?.typeName).toBe('ZodString');
    });

    it('should unwrap nested ZodEffects with object', () => {
      const schema = z.preprocess(
        (val) => (typeof val === 'string' ? { command: val } : val),
        z.object({
          command: z.string(),
        }),
      );
      const unwrapped = unwrapZodField(schema) as any;
      expect(unwrapped._def?.typeName).toBe('ZodObject');
    });

    it('should unwrap multiple layers', () => {
      const schema = z.preprocess(
        (val) => val,
        z.string().optional().default('test'),
      );
      const unwrapped = unwrapZodField(schema) as any;
      expect(unwrapped._def?.typeName).toBe('ZodString');
    });
  });

  describe('getZodTypeName', () => {
    it('should return "string" for ZodString', () => {
      expect(getZodTypeName(z.string())).toBe('string');
    });

    it('should return "number" for ZodNumber', () => {
      expect(getZodTypeName(z.number())).toBe('number');
    });

    it('should return "boolean" for ZodBoolean', () => {
      expect(getZodTypeName(z.boolean())).toBe('boolean');
    });

    it('should return "array" for ZodArray', () => {
      expect(getZodTypeName(z.array(z.string()))).toBe('array');
    });

    it('should return "object" for ZodObject', () => {
      expect(getZodTypeName(z.object({ foo: z.string() }))).toBe('object');
    });

    it('should return enum type for ZodEnum', () => {
      const result = getZodTypeName(z.enum(['a', 'b', 'c']));
      expect(result).toBe("enum('a', 'b', 'c')");
    });

    it('should handle ZodUnion', () => {
      const result = getZodTypeName(z.union([z.string(), z.number()]));
      expect(result).toBe('string | number');
    });

    it('should handle ZodOptional by unwrapping', () => {
      expect(getZodTypeName(z.string().optional())).toBe('string');
    });

    it('should handle ZodDefault by unwrapping', () => {
      expect(getZodTypeName(z.string().default('test'))).toBe('string');
    });

    it('should handle z.preprocess with string', () => {
      const schema = z.preprocess(
        (val) => (typeof val === 'string' ? val.toUpperCase() : val),
        z.string(),
      );
      expect(getZodTypeName(schema)).toBe('string');
    });

    it('should handle z.preprocess with object', () => {
      const schema = z.preprocess(
        (val) => (typeof val === 'string' ? { command: val } : val),
        z.object({
          command: z.string(),
        }),
      );
      expect(getZodTypeName(schema)).toBe('object');
    });

    it('should handle z.preprocess with enum', () => {
      const schema = z.preprocess(
        (val) => val,
        z.enum(['replace', 'clear', 'typeOnly']),
      );
      expect(getZodTypeName(schema)).toBe(
        "enum('replace', 'clear', 'typeOnly')",
      );
    });
  });

  describe('getZodDescription', () => {
    it('should return description from field', () => {
      const schema = z.string().describe('Test description');
      expect(getZodDescription(schema)).toBe('Test description');
    });

    it('should return null for field without description', () => {
      const schema = z.string();
      expect(getZodDescription(schema)).toBeNull();
    });

    it('should return description from optional field', () => {
      const schema = z.string().describe('Test description').optional();
      expect(getZodDescription(schema)).toBe('Test description');
    });

    it('should return description from default field', () => {
      const schema = z.string().describe('Test description').default('test');
      expect(getZodDescription(schema)).toBe('Test description');
    });

    it('should return description from z.preprocess', () => {
      const schema = z.preprocess(
        (val) => val,
        z.string().describe('Command to execute'),
      );
      expect(getZodDescription(schema)).toBe('Command to execute');
    });

    it('should handle z.preprocess with object containing description', () => {
      const schema = z.preprocess(
        (val) => (typeof val === 'string' ? { command: val } : val),
        z.object({
          command: z.string().describe('The command field'),
        }),
      );
      // Description on the object itself should be null
      expect(getZodDescription(schema)).toBeNull();
    });
  });

  describe('isMidsceneLocatorField', () => {
    it('should return false for non-object fields', () => {
      expect(isMidsceneLocatorField(z.string())).toBe(false);
      expect(isMidsceneLocatorField(z.number())).toBe(false);
    });

    it('should return true for object with prompt field', () => {
      const schema = z.object({
        prompt: z.string(),
        deepThink: z.boolean().optional(),
      });
      expect(isMidsceneLocatorField(schema)).toBe(true);
    });

    it('should return false for object without prompt field', () => {
      const schema = z.object({
        command: z.string(),
      });
      expect(isMidsceneLocatorField(schema)).toBe(false);
    });

    it('should handle optional locator field', () => {
      const schema = z
        .object({
          prompt: z.string(),
        })
        .optional();
      expect(isMidsceneLocatorField(schema)).toBe(true);
    });

    it('should handle z.preprocess wrapping locator field', () => {
      const schema = z.preprocess(
        (val) => val,
        z.object({
          prompt: z.string(),
        }),
      );
      expect(isMidsceneLocatorField(schema)).toBe(true);
    });
  });

  describe('z.preprocess integration tests', () => {
    it('should handle Launch-like action with z.preprocess', () => {
      const launchParamSchema = z.preprocess(
        (val) => (typeof val === 'string' ? { uri: val } : val),
        z.object({
          uri: z.string().describe('App package name or URL to launch'),
        }),
      );

      expect(getZodTypeName(launchParamSchema)).toBe('object');
      expect(getZodDescription(launchParamSchema)).toBeNull();
    });

    it('should handle RunAdbShell-like action with z.preprocess', () => {
      const runAdbShellParamSchema = z.preprocess(
        (val) => (typeof val === 'string' ? { command: val } : val),
        z.object({
          command: z.string().describe('ADB shell command to execute'),
        }),
      );

      expect(getZodTypeName(runAdbShellParamSchema)).toBe('object');
      expect(getZodDescription(runAdbShellParamSchema)).toBeNull();
    });

    it('should handle Input-like action with z.preprocess on field', () => {
      const inputParamSchema = z.object({
        value: z.string(),
        mode: z.preprocess(
          (val) => (val === 'append' ? 'typeOnly' : val),
          z
            .enum(['replace', 'clear', 'typeOnly'])
            .default('replace')
            .optional()
            .describe('Input mode'),
        ),
      });

      const modeField = (inputParamSchema as any).shape.mode;
      expect(getZodTypeName(modeField)).toBe(
        "enum('replace', 'clear', 'typeOnly')",
      );
      expect(getZodDescription(modeField)).toBe('Input mode');
    });
  });
});
