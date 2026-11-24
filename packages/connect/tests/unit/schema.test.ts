import { describe, expect, it } from '@rstest/core';
import {
  type ObjectParamSchema,
  SchemaError,
  assertParamSchema,
  paramsToWire,
  toZod,
  validateValue,
} from '../../src/schema';

describe('param schema subset', () => {
  const params: ObjectParamSchema = {
    type: 'object',
    properties: {
      phrase: { type: 'string', description: 'What to say' },
      times: { type: 'integer', minimum: 1 },
      target: { 'x-midscene-locate': true },
    },
    required: ['phrase'],
  };

  it('accepts the supported subset', () => {
    expect(() => assertParamSchema(params, 'params')).not.toThrow();
  });

  it('rejects keywords outside the subset', () => {
    expect(() =>
      assertParamSchema(
        { type: 'object', properties: {}, oneOf: [] },
        'params',
      ),
    ).toThrow(SchemaError);
    expect(() => assertParamSchema({ type: 'null' }, 'params')).toThrow(
      /type must be one of/,
    );
    expect(() =>
      assertParamSchema(
        { type: 'object', properties: {}, required: ['missing'] },
        'params',
      ),
    ).toThrow(/required/);
  });

  it('only allows locate markers on top-level action params', () => {
    expect(() =>
      assertParamSchema(
        {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              properties: { el: { 'x-midscene-locate': true } },
            },
          },
        },
        'params',
      ),
    ).toThrow(/only allowed on top-level/);
  });

  it('validates values strictly', () => {
    expect(() => validateValue(params, { phrase: 'hi' })).not.toThrow();
    expect(() => validateValue(params, {})).toThrow(/missing "phrase"/);
    expect(() => validateValue(params, { phrase: 'hi', extra: 1 })).toThrow(
      /unknown property "extra"/,
    );
    expect(() => validateValue(params, { phrase: 'hi', times: 1.5 })).toThrow(
      /integer/,
    );
    expect(() =>
      validateValue(params, { phrase: 'hi', target: { center: [1, 2] } }),
    ).toThrow(/missing "rect"/);
  });

  it('converts to zod for core planning', () => {
    const schema = toZod(params) as any;
    expect(schema.shape.phrase.description).toBe('What to say');
    expect(schema.safeParse({ phrase: 'hi' }).success).toBe(true);
    expect(schema.safeParse({ times: 2 }).success).toBe(false);
    // locate fields reuse core's locator schema
    expect(schema.shape.target.unwrap().shape.prompt).toBeDefined();
  });

  it('strips locate results to the wire shape', () => {
    expect(
      paramsToWire(params, {
        phrase: 'hi',
        target: {
          description: 'mic',
          center: [10, 20],
          rect: { left: 0, top: 0, width: 20, height: 40, dpr: 2 },
          xpaths: [],
        },
        ignored: true,
      }),
    ).toEqual({
      phrase: 'hi',
      target: {
        description: 'mic',
        center: [10, 20],
        rect: { left: 0, top: 0, width: 20, height: 40 },
      },
    });
  });
});
