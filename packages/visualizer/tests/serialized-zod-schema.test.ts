import { describe, expect, test } from 'vitest';
import {
  VALIDATION_CONSTANTS,
  extractDefaultValue,
  unwrapZodType,
} from '../src/types';

/**
 * These tests verify that the client-side type helpers correctly handle
 * serialized Zod schemas (plain objects received from the playground server
 * via JSON). This prevents regressions where enum fields render as text
 * inputs instead of dropdowns.
 */

// Helper: build a serialized schema object like what the server sends
function makeSerializedEnum(values: string[]) {
  return {
    _def: {
      typeName: 'ZodEnum',
      values,
    },
  };
}

function makeSerializedDefault(innerType: any, defaultValue: unknown) {
  return {
    _def: {
      typeName: 'ZodDefault',
      innerType,
      _serializedDefaultValue: defaultValue,
    },
  };
}

function makeSerializedOptional(innerType: any) {
  return {
    _def: {
      typeName: 'ZodOptional',
      innerType,
    },
  };
}

function makeSerializedString(description?: string) {
  return {
    _def: {
      typeName: 'ZodString',
      ...(description ? { description } : {}),
    },
  };
}

describe('unwrapZodType with serialized schemas', () => {
  test('unwraps ZodDefault to reveal ZodEnum', () => {
    const enumField = makeSerializedEnum(['replace', 'clear', 'typeOnly']);
    const defaultField = makeSerializedDefault(enumField, 'replace');

    const { actualField, isOptional, hasDefault } = unwrapZodType(
      defaultField as any,
    );

    expect(hasDefault).toBe(true);
    expect(isOptional).toBe(false);
    expect(actualField._def?.typeName).toBe('ZodEnum');
    expect((actualField._def as any).values).toEqual([
      'replace',
      'clear',
      'typeOnly',
    ]);
  });

  test('unwraps ZodOptional + ZodDefault', () => {
    const enumField = makeSerializedEnum(['up', 'down', 'left', 'right']);
    const defaultField = makeSerializedDefault(enumField, 'down');
    const optionalField = makeSerializedOptional(defaultField);

    const { actualField, isOptional, hasDefault } = unwrapZodType(
      optionalField as any,
    );

    expect(isOptional).toBe(true);
    expect(hasDefault).toBe(true);
    expect(actualField._def?.typeName).toBe('ZodEnum');
  });

  test('does not unwrap a plain ZodString', () => {
    const stringField = makeSerializedString('some description');

    const { actualField, isOptional, hasDefault } = unwrapZodType(
      stringField as any,
    );

    expect(isOptional).toBe(false);
    expect(hasDefault).toBe(false);
    expect(actualField._def?.typeName).toBe('ZodString');
  });
});

describe('extractDefaultValue with serialized schemas', () => {
  test('extracts _serializedDefaultValue from ZodDefault', () => {
    const enumField = makeSerializedEnum(['replace', 'clear', 'typeOnly']);
    const defaultField = makeSerializedDefault(enumField, 'replace');

    const result = extractDefaultValue(defaultField as any);
    expect(result).toBe('replace');
  });

  test('extracts boolean default value', () => {
    const boolField = { _def: { typeName: 'ZodBoolean' } };
    const defaultField = makeSerializedDefault(boolField, false);

    const result = extractDefaultValue(defaultField as any);
    expect(result).toBe(false);
  });

  test('returns undefined when no default exists', () => {
    const stringField = makeSerializedString();

    const result = extractDefaultValue(stringField as any);
    expect(result).toBeUndefined();
  });

  test('prefers runtime function over serialized value', () => {
    const enumField = makeSerializedEnum(['a', 'b']);
    const field = {
      _def: {
        typeName: 'ZodDefault',
        innerType: enumField,
        defaultValue: () => 'from-function',
        _serializedDefaultValue: 'from-serialized',
      },
    };

    const result = extractDefaultValue(field as any);
    expect(result).toBe('from-function');
  });
});
