import {
  getZodDescription,
  isMidsceneLocatorField,
  unwrapZodField,
} from '@midscene/shared/zod-schema-utils';
import type { z } from 'zod';
import type { PlanningActionDescriptionBuildInput } from '../../model-adapter/planning-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';

type QwenJsonSchema = {
  type?: string;
  description?: string;
  enum?: string[];
  items?: QwenJsonSchema;
  properties?: Record<string, QwenJsonSchema>;
  required?: string[];
  anyOf?: QwenJsonSchema[];
  additionalProperties?: boolean;
};

type QwenFunctionDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, QwenJsonSchema>;
      required: string[];
    };
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

const buildQwenJsonSchema = (field: unknown): QwenJsonSchema => {
  const schema = unwrapZodField(field) as {
    _def?: {
      typeName?: string;
      checks?: Array<{ kind?: string }>;
      options?: unknown[];
      type?: unknown;
      values?: unknown;
      unknownKeys?: string;
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
        items: buildQwenJsonSchema(schema._def.type),
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
                ...buildQwenJsonSchema(nestedField),
                ...(description ? { description } : {}),
              },
            ];
          }),
        ),
        required: shapeEntries
          .filter(([, nestedField]) => !nestedField.isOptional())
          .map(([name]) => name),
        ...(schema._def.unknownKeys === 'passthrough'
          ? { additionalProperties: true }
          : {}),
      };
    }
    case 'ZodUnion':
      return {
        anyOf: (schema._def.options ?? []).map(buildQwenJsonSchema),
      };
    default:
      return { type: 'object' };
  }
};

export const buildQwenActionDescription = ({
  action,
  locateFieldDescription,
}: PlanningActionDescriptionBuildInput): QwenFunctionDefinition => {
  const shapeEntries = Object.entries(
    getZodObjectShape(action.paramSchema) ?? {},
  );
  const properties = Object.fromEntries(
    shapeEntries.map(([name, field]) => {
      const description = getZodDescription(field);
      const isLocator = isMidsceneLocatorField(field);
      return [
        name,
        {
          ...(isLocator ? { type: 'string' } : buildQwenJsonSchema(field)),
          description: isLocator
            ? [
                description || `Target element for ${action.name}.`,
                locateFieldDescription,
              ].join(' ')
            : description || `Parameter ${name} for ${action.name}.`,
        },
      ];
    }),
  );

  return {
    type: 'function',
    function: {
      name: action.name,
      description: action.description || 'No description provided.',
      parameters: {
        type: 'object',
        properties,
        required: shapeEntries
          .filter(([, field]) => !field.isOptional())
          .map(([name]) => name),
      },
    },
  };
};

export const buildQwenLocateFieldDescription = (
  promptSpec?: LocateResultPromptSpec,
) =>
  promptSpec
    ? `The format is: <prompt>element description</prompt><coordinate>${promptSpec.resultValueSchema}</coordinate>. ${promptSpec.resultValueDescription}`
    : 'The format is: <prompt>element description</prompt>.';
