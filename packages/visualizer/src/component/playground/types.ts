import type { DeviceAction } from '@midscene/core';

// Zod schema related types
export interface ZodType {
  _def?: {
    typeName:
      | 'ZodOptional'
      | 'ZodDefault'
      | 'ZodNullable'
      | 'ZodObject'
      | 'ZodEnum'
      | 'ZodNumber'
      | 'ZodString';
    innerType?: ZodType;
    defaultValue?: () => unknown;
    shape?: () => Record<string, ZodType>;
    values?: string[];
  };
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
    'shape' in schema &&
    'parse' in schema &&
    typeof (schema as any).parse === 'function'
  );
};

export const isLocateField = (field: ZodType): boolean => {
  return !!(
    field._def?.typeName === VALIDATION_CONSTANTS.ZOD_TYPES.OBJECT &&
    field._def.shape?.() &&
    VALIDATION_CONSTANTS.FIELD_FLAGS.LOCATION in (field._def.shape?.() || {})
  );
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
