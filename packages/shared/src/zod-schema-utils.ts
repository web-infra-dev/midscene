import type { z } from 'zod';

export type ZodValueKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'unknown';

/**
 * Recursively unwrap optional, nullable, default, and effects wrapper types
 * to get the actual inner Zod type
 */
export function unwrapZodField(field: unknown): unknown {
  const f = field as {
    _def?: { typeName?: string; innerType?: unknown; schema?: unknown };
  };
  if (!f._def) return f;

  const typeName = f._def.typeName;

  // Handle wrapper types that have innerType
  if (
    typeName === 'ZodOptional' ||
    typeName === 'ZodNullable' ||
    typeName === 'ZodDefault'
  ) {
    return unwrapZodField(f._def.innerType);
  }

  // Handle ZodEffects (transformations, refinements, preprocessors)
  if (typeName === 'ZodEffects') {
    if (f._def.schema) {
      return unwrapZodField(f._def.schema);
    }
  }

  return f;
}

function getLiteralValueKind(value: unknown): ZodValueKind {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'unknown';
}

function getNativeEnumValueKinds(
  values: Record<string, unknown> | undefined,
): Set<ZodValueKind> {
  const enumValues = Object.entries(values ?? {})
    .filter(([key]) => Number.isNaN(Number(key)))
    .map(([, value]) => value);
  return new Set(enumValues.map(getLiteralValueKind));
}

/**
 * Return every top-level value kind accepted by a Zod field. Unlike
 * `getZodTypeName`, this normalizes enums, literals, and unions so consumers
 * can make type-directed decisions without parsing its display label.
 */
export function getZodValueKinds(field: unknown): Set<ZodValueKind> {
  const actualField = unwrapZodField(field) as {
    _def?: {
      typeName?: string;
      options?: unknown[];
      value?: unknown;
      values?: Record<string, unknown>;
    };
  };
  const definition = actualField._def;

  switch (definition?.typeName) {
    case 'ZodString':
    case 'ZodEnum':
      return new Set(['string']);
    case 'ZodNumber':
      return new Set(['number']);
    case 'ZodBoolean':
      return new Set(['boolean']);
    case 'ZodArray':
    case 'ZodTuple':
      return new Set(['array']);
    case 'ZodObject':
    case 'ZodRecord':
    case 'ZodDiscriminatedUnion':
      return new Set(['object']);
    case 'ZodLiteral':
      return new Set([getLiteralValueKind(definition.value)]);
    case 'ZodNativeEnum':
      return getNativeEnumValueKinds(definition.values);
    case 'ZodUnion':
      return new Set(
        (definition.options ?? []).flatMap((option) => [
          ...getZodValueKinds(option),
        ]),
      );
    default:
      return new Set(['unknown']);
  }
}

/**
 * Check if a field is a Midscene locator field
 * Locator input schemas are identified by their prompt field.
 */
export function isMidsceneLocatorField(field: unknown): boolean {
  const actualField = unwrapZodField(field) as {
    _def?: { typeName?: string; shape?: () => Record<string, unknown> };
  };

  if (actualField._def?.typeName === 'ZodObject') {
    const shape = actualField._def.shape?.();
    if (shape) {
      if ('prompt' in shape && shape.prompt) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Get type name string from a Zod schema field
 * @param field - Zod schema field
 */
export function getZodTypeName(field: unknown): string {
  const actualField = unwrapZodField(field) as {
    _def?: { typeName?: string; values?: unknown[]; options?: unknown[] };
  };
  const fieldTypeName = actualField._def?.typeName;

  if (fieldTypeName === 'ZodString') return 'string';
  if (fieldTypeName === 'ZodNumber') return 'number';
  if (fieldTypeName === 'ZodBoolean') return 'boolean';
  if (fieldTypeName === 'ZodArray') return 'array';
  if (fieldTypeName === 'ZodObject') return 'object';
  if (fieldTypeName === 'ZodEnum') {
    const values =
      (actualField._def?.values as unknown[] | undefined)
        ?.map((option: unknown) => String(`'${option}'`))
        .join(', ') ?? 'enum';
    return `enum(${values})`;
  }
  // Handle ZodUnion by listing all option types
  if (fieldTypeName === 'ZodUnion') {
    const options = actualField._def?.options as unknown[] | undefined;
    if (options && options.length > 0) {
      const types = options.map((opt: unknown) => getZodTypeName(opt));
      return types.join(' | ');
    }
    return 'union';
  }

  return 'unknown';
}

/**
 * Get description from a Zod schema field
 */
export function getZodDescription(field: z.ZodTypeAny): string | null {
  // Check for direct description on the original field (wrapper may have description)
  if ('description' in field) {
    return (field as { description?: string }).description || null;
  }

  const actualField = unwrapZodField(field) as {
    description?: string;
    _def?: { typeName?: string; shape?: () => Record<string, unknown> };
  };

  // Check for description on the unwrapped field
  if ('description' in actualField) {
    return actualField.description || null;
  }

  // Check for MidsceneLocation fields and add description
  if (isMidsceneLocatorField(actualField)) {
    return 'Location information for the target element';
  }

  return null;
}
