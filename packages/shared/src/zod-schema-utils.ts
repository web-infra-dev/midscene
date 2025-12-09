import type { z } from 'zod';

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

/**
 * Check if a field is a Midscene locator field
 * Checks for either:
 * 1. midscene_location_field_flag in shape (result schema)
 * 2. prompt field in shape (input schema)
 */
export function isMidsceneLocatorField(field: unknown): boolean {
  const actualField = unwrapZodField(field) as {
    _def?: { typeName?: string; shape?: () => Record<string, unknown> };
  };

  if (actualField._def?.typeName === 'ZodObject') {
    const shape = actualField._def.shape?.();
    if (shape) {
      // Method 1: Check for the location field flag (for result schema)
      if ('midscene_location_field_flag' in shape) {
        return true;
      }
      // Method 2: Check if it's the input schema by checking for 'prompt' field
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
 * @param locatorTypeDescription - Optional description for MidsceneLocation fields (used by core)
 */
export function getZodTypeName(
  field: unknown,
  locatorTypeDescription?: string,
): string {
  const actualField = unwrapZodField(field) as {
    _def?: { typeName?: string; values?: unknown[]; options?: unknown[] };
  };
  const fieldTypeName = actualField._def?.typeName;

  if (fieldTypeName === 'ZodString') return 'string';
  if (fieldTypeName === 'ZodNumber') return 'number';
  if (fieldTypeName === 'ZodBoolean') return 'boolean';
  if (fieldTypeName === 'ZodArray') return 'array';
  if (fieldTypeName === 'ZodObject') {
    // Check if this is a Midscene locator field
    if (isMidsceneLocatorField(actualField)) {
      return locatorTypeDescription || 'object';
    }
    return 'object';
  }
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
      const types = options.map((opt: unknown) =>
        getZodTypeName(opt, locatorTypeDescription),
      );
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
