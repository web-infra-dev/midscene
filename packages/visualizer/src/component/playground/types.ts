import type { DeviceAction } from '@midscene/core';

// Zod schema related types - compatible with actual zod types
export interface ZodType {
  _def?: {
    typeName:
      | 'ZodOptional'
      | 'ZodDefault'
      | 'ZodNullable'
      | 'ZodObject'
      | 'ZodEnum'
      | 'ZodNumber'
      | 'ZodString'
      | 'ZodBoolean';
    innerType?: ZodType;
    defaultValue?: () => unknown;
    shape?: () => Record<string, ZodType>;
    values?: string[];
    description?: string;
  };
  description?: string; // For direct access to description
}

export interface ZodObjectSchema extends ZodType {
  shape: Record<string, ZodType>;
  parse: (data: unknown) => unknown;
}

export interface ZodEnumSchema extends ZodType {
  _def: {
    typeName: 'ZodEnum';
    values: string[];
  };
}

export interface ZodNumberSchema extends ZodType {
  _def: {
    typeName: 'ZodNumber';
  };
}

export interface ZodBooleanSchema extends ZodType {
  _def: {
    typeName: 'ZodBoolean';
  };
}

// Interface for accessing Zod objects at runtime
export interface ZodRuntimeAccess extends ZodType {
  shape?: Record<string, ZodType>;
  description?: string;
  typeName?: string;
  type?: string;
}

// ActionSpace related types - compatible with DeviceAction
export interface ActionSpaceItem
  extends Omit<DeviceAction<any>, 'paramSchema'> {
  paramSchema?: ZodObjectSchema;
}

// Form parameter types
export interface FormParams {
  [key: string]: string | number | boolean | null | undefined;
}

// Validation constants
export const VALIDATION_CONSTANTS = {
  ZOD_TYPES: {
    OPTIONAL: 'ZodOptional',
    DEFAULT: 'ZodDefault',
    NULLABLE: 'ZodNullable',
    OBJECT: 'ZodObject',
    ENUM: 'ZodEnum',
    NUMBER: 'ZodNumber',
    STRING: 'ZodString',
    BOOLEAN: 'ZodBoolean',
  },
  FIELD_FLAGS: {
    LOCATION: 'midscene_location_field_flag',
  },
  DEFAULT_VALUES: {
    ACTION_TYPE: 'aiAction',
    TIMEOUT_MS: 15000,
    CHECK_INTERVAL_MS: 3000,
  },
} as const;

// Type guards
export const isZodObjectSchema = (
  schema: unknown,
): schema is ZodObjectSchema => {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    ('shape' in schema || (schema as { type?: string }).type === 'ZodObject')
  );
};

export const isLocateField = (field: ZodType): boolean => {
  // Handle both runtime Zod objects and processed schema objects from server
  const fieldWithRuntime = field as ZodRuntimeAccess;

  // Check if it's a runtime ZodObject
  if (field._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.OBJECT) {
    // Try different ways to access the shape for runtime Zod objects
    let shape;
    if (field._def.shape) {
      if (typeof field._def.shape === 'function') {
        shape = field._def.shape();
      } else {
        shape = field._def.shape;
      }
    }

    // Also try accessing shape directly from the field object
    if (!shape && fieldWithRuntime.shape) {
      shape = fieldWithRuntime.shape;
    }

    // Check for the location flag in shape
    if (shape && VALIDATION_CONSTANTS.FIELD_FLAGS.LOCATION in shape) {
      return true;
    }

    // Check description contains location-related keywords
    const description =
      (field._def as { description?: string })?.description ||
      fieldWithRuntime.description ||
      '';
    if (
      typeof description === 'string' &&
      description.toLowerCase().includes('input field')
    ) {
      return true;
    }
  }

  // Handle processed schema objects from server (these don't have _def)
  // For these, we need to check if the field represents a location input
  // Since the server processing loses the original Zod metadata, we use heuristics

  // If it's an object-like structure, check for location indicators
  if (typeof field === 'object' && field !== null) {
    // Check if it has properties that suggest it's a location field
    // In processed schemas, location fields typically have specific characteristics

    // Check for description patterns
    const description =
      fieldWithRuntime.description ||
      (fieldWithRuntime._def as { description?: string })?.description ||
      '';
    if (typeof description === 'string') {
      const desc = description.toLowerCase();
      if (
        desc.includes('input field') ||
        desc.includes('element') ||
        desc.includes('locate')
      ) {
        return true;
      }
    }

    // Check for type patterns that suggest location fields
    if (
      (fieldWithRuntime as { typeName?: string }).typeName === 'ZodObject' ||
      (fieldWithRuntime as { type?: string }).type === 'ZodObject'
    ) {
      // For processed schemas, location fields are often described as input fields
      return (
        typeof description === 'string' &&
        description.toLowerCase().includes('input field')
      );
    }
  }

  return false;
};

// Helper function to unwrap nested Zod types
export const unwrapZodType = (
  field: ZodType,
): { actualField: ZodType; isOptional: boolean; hasDefault: boolean } => {
  let actualField = field;
  let isOptional = false;
  let hasDefault = false;

  while (
    actualField._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.OPTIONAL ||
    actualField._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.DEFAULT ||
    actualField._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.NULLABLE
  ) {
    if (
      actualField._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.OPTIONAL
    ) {
      isOptional = true;
    }
    if (actualField._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.DEFAULT) {
      hasDefault = true;
    }
    actualField = actualField._def.innerType || actualField;
  }

  return { actualField, isOptional, hasDefault };
};

// Function to extract default value from Zod field
export const extractDefaultValue = (field: ZodType): unknown => {
  let currentField = field;

  while (currentField._def?.innerType) {
    if (
      currentField._def.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.DEFAULT &&
      currentField._def.defaultValue
    ) {
      return currentField._def.defaultValue();
    }
    currentField = currentField._def.innerType;
  }

  return undefined;
};
