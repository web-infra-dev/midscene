/**
 * A deliberately small JSON Schema subset used for custom action params,
 * device options and the wire protocol. Anything outside the subset is
 * rejected up front instead of being half-supported.
 */
import { getMidsceneLocationSchema, z } from '@midscene/core';

export const LOCATE_KEYWORD = 'x-midscene-locate';

export type ParamSchema =
  | {
      type: 'string';
      description?: string;
      enum?: string[];
      minLength?: number;
      maxLength?: number;
    }
  | {
      type: 'number' | 'integer';
      description?: string;
      minimum?: number;
      maximum?: number;
    }
  | { type: 'boolean'; description?: string }
  | {
      type: 'array';
      description?: string;
      items: ParamSchema;
      minItems?: number;
      maxItems?: number;
    }
  | ObjectParamSchema
  | LocateParamSchema;

export interface ObjectParamSchema {
  type: 'object';
  description?: string;
  properties: Record<string, ParamSchema>;
  required?: string[];
}

/** An element the AI should locate on screen; resolved on the client side. */
export interface LocateParamSchema {
  [LOCATE_KEYWORD]: true;
  description?: string;
}

/** The wire form of a located element. */
export interface LocatedElement {
  description: string;
  center: [number, number];
  rect: { left: number; top: number; width: number; height: number };
}

export class SchemaError extends Error {}

const allowedKeys: Record<string, string[]> = {
  string: ['type', 'description', 'enum', 'minLength', 'maxLength'],
  number: ['type', 'description', 'minimum', 'maximum'],
  integer: ['type', 'description', 'minimum', 'maximum'],
  boolean: ['type', 'description'],
  array: ['type', 'description', 'items', 'minItems', 'maxItems'],
  object: ['type', 'description', 'properties', 'required'],
  locate: [LOCATE_KEYWORD, 'description'],
};

export function isLocateSchema(
  schema: ParamSchema,
): schema is LocateParamSchema {
  return (schema as LocateParamSchema)[LOCATE_KEYWORD] === true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Throw unless `schema` is inside the supported subset. */
export function assertParamSchema(
  schema: unknown,
  path = 'schema',
  { allowLocate = false } = {},
): asserts schema is ParamSchema {
  if (!isPlainObject(schema))
    throw new SchemaError(`${path} must be an object`);
  const kind =
    schema[LOCATE_KEYWORD] === true ? 'locate' : (schema.type as string);
  const keys = allowedKeys[kind];
  if (!keys)
    throw new SchemaError(
      `${path}.type must be one of string, number, integer, boolean, array, object (got ${JSON.stringify(schema.type)})`,
    );
  for (const key of Object.keys(schema))
    if (!keys.includes(key))
      throw new SchemaError(`${path}.${key} is not supported for "${kind}"`);
  if (
    schema.description !== undefined &&
    typeof schema.description !== 'string'
  )
    throw new SchemaError(`${path}.description must be a string`);
  if (kind === 'locate' && !allowLocate)
    throw new SchemaError(
      `${path}: "${LOCATE_KEYWORD}" is only allowed on top-level properties of action params`,
    );
  if (kind === 'string' && schema.enum !== undefined) {
    if (
      !Array.isArray(schema.enum) ||
      !schema.enum.length ||
      schema.enum.some((v) => typeof v !== 'string')
    )
      throw new SchemaError(`${path}.enum must be a non-empty string array`);
  }
  for (const key of [
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'minItems',
    'maxItems',
  ])
    if (schema[key] !== undefined && typeof schema[key] !== 'number')
      throw new SchemaError(`${path}.${key} must be a number`);
  if (kind === 'array') assertParamSchema(schema.items, `${path}.items`);
  if (kind === 'object') {
    if (!isPlainObject(schema.properties))
      throw new SchemaError(`${path}.properties must be an object`);
    for (const [name, prop] of Object.entries(schema.properties))
      assertParamSchema(prop, `${path}.properties.${name}`, {
        allowLocate: path === 'params',
      });
    if (schema.required !== undefined) {
      if (
        !Array.isArray(schema.required) ||
        schema.required.some(
          (name) =>
            typeof name !== 'string' ||
            !(name in (schema.properties as object)),
        )
      )
        throw new SchemaError(
          `${path}.required must list names declared in properties`,
        );
    }
  }
}

/** Strictly validate `value`; unknown object keys are rejected. */
export function validateValue(
  schema: ParamSchema,
  value: unknown,
  path = 'value',
): void {
  const fail = (message: string): never => {
    throw new SchemaError(`${path} ${message}`);
  };
  if (isLocateSchema(schema)) {
    if (!isPlainObject(value)) fail('must be a located element');
    validateValue(locatedElementSchema, value, path);
    return;
  }
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') fail('must be a string');
      if (schema.enum && !schema.enum.includes(value as string))
        fail(`must be one of ${schema.enum.join(', ')}`);
      if (
        schema.minLength !== undefined &&
        (value as string).length < schema.minLength
      )
        fail(`must have at least ${schema.minLength} characters`);
      if (
        schema.maxLength !== undefined &&
        (value as string).length > schema.maxLength
      )
        fail(`must have at most ${schema.maxLength} characters`);
      return;
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value))
        fail('must be a finite number');
      if (schema.type === 'integer' && !Number.isInteger(value))
        fail('must be an integer');
      if (schema.minimum !== undefined && (value as number) < schema.minimum)
        fail(`must be >= ${schema.minimum}`);
      if (schema.maximum !== undefined && (value as number) > schema.maximum)
        fail(`must be <= ${schema.maximum}`);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') fail('must be a boolean');
      return;
    case 'array': {
      if (!Array.isArray(value)) fail('must be an array');
      const list = value as unknown[];
      if (schema.minItems !== undefined && list.length < schema.minItems)
        fail(`must have at least ${schema.minItems} items`);
      if (schema.maxItems !== undefined && list.length > schema.maxItems)
        fail(`must have at most ${schema.maxItems} items`);
      list.forEach((item, i) =>
        validateValue(schema.items, item, `${path}[${i}]`),
      );
      return;
    }
    case 'object': {
      if (!isPlainObject(value)) fail('must be an object');
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record))
        if (!(key in schema.properties)) fail(`has unknown property "${key}"`);
      for (const name of schema.required ?? [])
        if (record[name] === undefined) fail(`is missing "${name}"`);
      for (const [name, prop] of Object.entries(schema.properties))
        if (record[name] !== undefined)
          validateValue(prop, record[name], `${path}.${name}`);
      return;
    }
  }
}

const num = { type: 'number' } as const;
export const pointSchema: ObjectParamSchema = {
  type: 'object',
  properties: { x: num, y: num },
  required: ['x', 'y'],
};
export const locatedElementSchema: ObjectParamSchema = {
  type: 'object',
  description: 'An element located on the screenshot',
  properties: {
    description: { type: 'string' },
    center: { type: 'array', items: num, minItems: 2, maxItems: 2 },
    rect: {
      type: 'object',
      properties: { left: num, top: num, width: num, height: num },
      required: ['left', 'top', 'width', 'height'],
    },
  },
  required: ['center', 'rect'],
};

/** Reduce a core locate result to the plain wire shape. */
export function toLocatedElement(value: any): LocatedElement {
  const { left, top, width, height } = value.rect;
  return {
    description: value.description ?? '',
    center: [value.center[0], value.center[1]],
    rect: { left, top, width, height },
  };
}

/** Strip locate results in action params down to their wire shape. */
export function paramsToWire(
  schema: ObjectParamSchema | undefined,
  params: unknown,
): Record<string, unknown> {
  if (!schema) return {};
  const record = { ...((params ?? {}) as Record<string, unknown>) };
  for (const [name, prop] of Object.entries(schema.properties))
    if (isLocateSchema(prop) && record[name] != null)
      record[name] = toLocatedElement(record[name]);
  for (const key of Object.keys(record))
    if (!(key in schema.properties) || record[key] === undefined)
      delete record[key];
  return record;
}

/** Convert the subset into the zod shape consumed by core planning. */
export function toZod(schema: ParamSchema): z.ZodTypeAny {
  let type: z.ZodTypeAny;
  if (isLocateSchema(schema)) {
    type = getMidsceneLocationSchema();
  } else {
    switch (schema.type) {
      case 'string': {
        let s = schema.enum
          ? z.enum(schema.enum as [string, ...string[]])
          : z.string();
        if (!schema.enum && schema.minLength !== undefined)
          s = (s as z.ZodString).min(schema.minLength);
        if (!schema.enum && schema.maxLength !== undefined)
          s = (s as z.ZodString).max(schema.maxLength);
        type = s;
        break;
      }
      case 'number':
      case 'integer': {
        let n = z.number();
        if (schema.type === 'integer') n = n.int();
        if (schema.minimum !== undefined) n = n.min(schema.minimum);
        if (schema.maximum !== undefined) n = n.max(schema.maximum);
        type = n;
        break;
      }
      case 'boolean':
        type = z.boolean();
        break;
      case 'array': {
        let a = z.array(toZod(schema.items));
        if (schema.minItems !== undefined) a = a.min(schema.minItems);
        if (schema.maxItems !== undefined) a = a.max(schema.maxItems);
        type = a;
        break;
      }
      case 'object': {
        const required = new Set(schema.required ?? []);
        type = z.object(
          Object.fromEntries(
            Object.entries(schema.properties).map(([name, prop]) => {
              const field = toZod(prop);
              return [name, required.has(name) ? field : field.optional()];
            }),
          ),
        );
        break;
      }
    }
  }
  return schema.description ? type.describe(schema.description) : type;
}

/** Coerce a raw CLI string into the type a schema expects. */
export function coerceCliValue(schema: ParamSchema, raw: string): unknown {
  if (isLocateSchema(schema)) return raw;
  switch (schema.type) {
    case 'number':
    case 'integer':
      return raw.trim() === '' ? raw : Number(raw);
    case 'boolean':
      return raw === 'true' ? true : raw === 'false' ? false : raw;
    case 'array':
    case 'object':
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    default:
      return raw;
  }
}
