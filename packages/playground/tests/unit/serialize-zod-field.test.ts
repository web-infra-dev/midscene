import { z } from '@midscene/core';
import { describe, expect, test } from 'vitest';
import { serializeZodField } from '../../src/server';

describe('serializeZodField', () => {
  test('serializes ZodString and preserves typeName', () => {
    const field = z.string().describe('a string field');
    const serialized = serializeZodField(field);
    const parsed = JSON.parse(JSON.stringify(serialized));

    expect(parsed._def.typeName).toBe('ZodString');
    expect(parsed._def.description).toBe('a string field');
  });

  test('serializes ZodEnum and preserves values', () => {
    const field = z.enum(['replace', 'clear', 'typeOnly']);
    const serialized = serializeZodField(field);
    const parsed = JSON.parse(JSON.stringify(serialized));

    expect(parsed._def.typeName).toBe('ZodEnum');
    expect(parsed._def.values).toEqual(['replace', 'clear', 'typeOnly']);
  });

  test('serializes ZodDefault wrapping ZodEnum and preserves both layers', () => {
    const field = z
      .enum(['replace', 'clear', 'typeOnly'])
      .default('replace')
      .describe('input mode');
    const serialized = serializeZodField(field);
    const parsed = JSON.parse(JSON.stringify(serialized));

    // Outer layer: ZodDefault
    expect(parsed._def.typeName).toBe('ZodDefault');
    expect(parsed._def._serializedDefaultValue).toBe('replace');
    expect(parsed._def.description).toBe('input mode');

    // Inner layer: ZodEnum
    const inner = parsed._def.innerType;
    expect(inner._def.typeName).toBe('ZodEnum');
    expect(inner._def.values).toEqual(['replace', 'clear', 'typeOnly']);
  });

  test('serializes ZodOptional wrapping ZodString', () => {
    const field = z.string().optional();
    const serialized = serializeZodField(field);
    const parsed = JSON.parse(JSON.stringify(serialized));

    expect(parsed._def.typeName).toBe('ZodOptional');
    expect(parsed._def.innerType._def.typeName).toBe('ZodString');
  });

  test('serializes ZodNumber', () => {
    const field = z.number().describe('distance in pixels');
    const serialized = serializeZodField(field);
    const parsed = JSON.parse(JSON.stringify(serialized));

    expect(parsed._def.typeName).toBe('ZodNumber');
    expect(parsed._def.description).toBe('distance in pixels');
  });

  test('serializes ZodBoolean', () => {
    const field = z.boolean().default(false);
    const serialized = serializeZodField(field);
    const parsed = JSON.parse(JSON.stringify(serialized));

    expect(parsed._def.typeName).toBe('ZodDefault');
    expect(parsed._def._serializedDefaultValue).toBe(false);
    expect(parsed._def.innerType._def.typeName).toBe('ZodBoolean');
  });

  test('serializes ZodObject with nested fields', () => {
    const field = z.object({
      prompt: z.string(),
      flag: z.boolean().optional(),
    });
    const serialized = serializeZodField(field);
    const parsed = JSON.parse(JSON.stringify(serialized));

    expect(parsed._def.typeName).toBe('ZodObject');
    expect(parsed.shape).toBeDefined();
    expect(parsed.shape.prompt._def.typeName).toBe('ZodString');
    expect(parsed.shape.flag._def.typeName).toBe('ZodOptional');
    expect(parsed.shape.flag._def.innerType._def.typeName).toBe('ZodBoolean');
  });

  test('round-trips the real actionInputParamSchema mode field through JSON', () => {
    // Reproduce the exact schema used in @midscene/core for the input action
    const modeField = z
      .enum(['replace', 'clear', 'typeOnly'])
      .default('replace')
      .describe('Input mode');

    const serialized = serializeZodField(modeField);
    // Simulate network transfer
    const parsed = JSON.parse(JSON.stringify(serialized));

    // Client-side unwrap: walk through ZodDefault → ZodEnum
    let current = parsed;
    let hasDefault = false;
    while (
      current._def?.typeName === 'ZodOptional' ||
      current._def?.typeName === 'ZodDefault' ||
      current._def?.typeName === 'ZodNullable'
    ) {
      if (current._def.typeName === 'ZodDefault') {
        hasDefault = true;
      }
      current = current._def.innerType;
    }

    expect(hasDefault).toBe(true);
    expect(current._def.typeName).toBe('ZodEnum');
    expect(current._def.values).toEqual(['replace', 'clear', 'typeOnly']);
  });

  test('handles non-object input gracefully', () => {
    expect(serializeZodField(null)).toBe(null);
    expect(serializeZodField(undefined)).toBe(undefined);
    expect(serializeZodField('string')).toBe('string');
    expect(serializeZodField(42)).toBe(42);
  });

  test('handles object without _def gracefully', () => {
    const plain = { foo: 'bar' };
    expect(serializeZodField(plain)).toEqual(plain);
  });
});
