import {
  getZodDescription,
  isMidsceneLocatorField,
  unwrapZodField,
} from '@midscene/shared/zod-schema-utils';
import type { z } from 'zod';
import type { PlanningActionDescriptionBuildInput } from '../../model-adapter/planning-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';

type DoubaoJsonSchema = {
  type?: string;
  description?: string;
  enum?: string[];
  items?: DoubaoJsonSchema;
  properties?: Record<string, DoubaoJsonSchema>;
  required?: string[];
  anyOf?: DoubaoJsonSchema[];
};

type DoubaoParameterDefinition = DoubaoJsonSchema & {
  description: string;
};

export type DoubaoFunctionDefinition = {
  type?: 'function';
  name: string;
  description?: string;
  parameters: {
    type: 'object';
    properties: Record<string, DoubaoParameterDefinition>;
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

const buildDoubaoJsonSchema = (field: unknown): DoubaoJsonSchema => {
  const schema = unwrapZodField(field) as {
    _def?: {
      typeName?: string;
      checks?: Array<{ kind?: string }>;
      options?: unknown[];
      type?: unknown;
      values?: unknown;
    };
  };

  switch (schema._def?.typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodEnum': {
      const values = schema._def.values;
      return {
        type: 'string',
        ...(Array.isArray(values) &&
        values.every((value) => typeof value === 'string')
          ? { enum: values }
          : {}),
      };
    }
    case 'ZodNumber':
      return {
        type: schema._def.checks?.some((check) => check.kind === 'int')
          ? 'integer'
          : 'number',
      };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray':
      return {
        type: 'array',
        items: buildDoubaoJsonSchema(schema._def.type),
      };
    case 'ZodObject': {
      const shapeEntries = Object.entries(getZodObjectShape(schema) ?? {});
      return {
        type: 'object',
        properties: Object.fromEntries(
          shapeEntries.map(([name, nestedField]) => {
            const description = getZodDescription(nestedField);
            return [
              name,
              {
                ...buildDoubaoJsonSchema(nestedField),
                ...(description ? { description } : {}),
              },
            ];
          }),
        ),
        required: shapeEntries
          .filter(
            ([, nestedField]) =>
              !(
                typeof nestedField.isOptional === 'function' &&
                nestedField.isOptional()
              ),
          )
          .map(([name]) => name),
      };
    }
    case 'ZodUnion':
      return {
        anyOf: (schema._def.options ?? []).map(buildDoubaoJsonSchema),
      };
    default:
      return { type: 'object' };
  }
};

export const buildDoubaoActionDescription = ({
  action,
  locateFieldDescription,
}: PlanningActionDescriptionBuildInput): DoubaoFunctionDefinition => {
  const shapeEntries = Object.entries(
    getZodObjectShape(action.paramSchema) ?? {},
  );
  const properties = Object.fromEntries(
    shapeEntries.map(([name, field]) => {
      const isLocator = isMidsceneLocatorField(field);
      const fieldDescription = getZodDescription(field);
      return [
        name,
        {
          ...(isLocator ? { type: 'string' } : buildDoubaoJsonSchema(field)),
          description: isLocator
            ? [
                fieldDescription || `Target element for ${action.name}.`,
                locateFieldDescription,
              ].join(' ')
            : fieldDescription || `Parameter ${name} for ${action.name}.`,
        },
      ];
    }),
  ) as Record<string, DoubaoParameterDefinition>;
  const required = shapeEntries
    .filter(
      ([, field]) =>
        !(typeof field.isOptional === 'function' && field.isOptional()),
    )
    .map(([name]) => name);

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
