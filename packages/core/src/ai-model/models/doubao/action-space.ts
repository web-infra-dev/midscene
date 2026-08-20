import {
  getZodDescription,
  isMidsceneLocatorField,
  unwrapZodField,
} from '@midscene/shared/zod-schema-utils';
import type { z } from 'zod';
import type { PlanningActionDescriptionBuildInput } from '../../model-adapter/planning-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';

type SeedParameterDefinition = {
  type: string | string[];
  description: string;
  enum?: string[];
};

type SeedFunctionDefinition = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, SeedParameterDefinition>;
    required: string[];
  };
};

const getZodObjectShape = (
  schema: unknown,
): Record<string, z.ZodTypeAny> | undefined => {
  if (!schema) {
    return undefined;
  }

  const actualSchema = unwrapZodField(schema) as {
    _def?: {
      typeName?: string;
      shape?: () => Record<string, z.ZodTypeAny>;
    };
    shape?: Record<string, z.ZodTypeAny>;
  };
  if (actualSchema._def?.typeName !== 'ZodObject') {
    return undefined;
  }
  return typeof actualSchema._def.shape === 'function'
    ? actualSchema._def.shape()
    : actualSchema.shape;
};

const enumValuesForSchema = (field: unknown): string[] | undefined => {
  const schema = unwrapZodField(field) as {
    _def?: { typeName?: string; values?: unknown };
  };
  const values = schema._def?.values;
  return schema._def?.typeName === 'ZodEnum' &&
    Array.isArray(values) &&
    values.every((value) => typeof value === 'string')
    ? values
    : undefined;
};

const typeForSchema = (field: unknown): string | string[] => {
  const schema = unwrapZodField(field) as {
    _def?: {
      typeName?: string;
      checks?: Array<{ kind?: string }>;
      options?: unknown[];
    };
  };
  switch (schema._def?.typeName) {
    case 'ZodString':
    case 'ZodEnum':
      return 'string';
    case 'ZodNumber':
      return schema._def.checks?.some((check) => check.kind === 'int')
        ? 'integer'
        : 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodArray':
      return 'array';
    case 'ZodObject':
      return 'object';
    case 'ZodUnion': {
      const optionTypes = (schema._def.options ?? []).flatMap((option) => {
        const optionType = typeForSchema(option);
        return Array.isArray(optionType) ? optionType : [optionType];
      });
      const uniqueOptionTypes = [...new Set(optionTypes)];
      return uniqueOptionTypes.length === 1
        ? uniqueOptionTypes[0]
        : uniqueOptionTypes;
    }
    default:
      return 'object';
  }
};

export const buildDoubaoActionDescription = ({
  action,
  locateFieldDescription,
}: PlanningActionDescriptionBuildInput): SeedFunctionDefinition => {
  const properties: Record<string, SeedParameterDefinition> = {};
  const required: string[] = [];
  const shape = getZodObjectShape(action.paramSchema);

  for (const [name, field] of Object.entries(shape ?? {})) {
    const enumValues = enumValuesForSchema(field);
    const isLocator = isMidsceneLocatorField(field);
    const fieldDescription = getZodDescription(field);
    properties[name] = {
      type: isLocator ? 'string' : typeForSchema(field),
      description: isLocator
        ? [
            fieldDescription || `Target element for ${action.name}.`,
            locateFieldDescription,
          ].join(' ')
        : fieldDescription || `Parameter ${name} for ${action.name}.`,
      ...(enumValues ? { enum: enumValues } : {}),
    };

    const isOptional =
      typeof field.isOptional === 'function' && field.isOptional();
    if (!isOptional) {
      required.push(name);
    }
  }

  return {
    name: action.name,
    description: action.description || 'No description provided.',
    parameters: {
      type: 'object',
      properties,
      required,
    },
  };
};

export const buildDoubaoLocateFieldDescription = (
  locatePromptSpec?: LocateResultPromptSpec,
) => {
  if (locatePromptSpec && locatePromptSpec.resultKey !== 'point') {
    throw new Error(
      'Doubao planning protocol requires a point locate result adapter',
    );
  }

  return locatePromptSpec
    ? `The format is: <prompt>element description</prompt><point>x y</point>. ${locatePromptSpec.resultValueDescription}`
    : 'The format is: <prompt>element description</prompt>.';
};
