import type { DeviceAction } from '@/types';
import {
  getZodDescription,
  getZodTypeName,
} from '@midscene/shared/zod-schema-utils';
import yaml from 'js-yaml';
import type { z } from 'zod';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import { buildActionExample } from './action-example';

export const locateParamSchemaDescription = (
  promptSpec?: LocateResultPromptSpec,
) => {
  if (promptSpec) {
    return `{ prompt: string, ${promptSpec.resultKey}: ${promptSpec.resultValueSchema} /* ${promptSpec.resultValueDescription} */ }`;
  }
  return '{ prompt: string /* description of the target element */ }';
};

/**
 * Find ZodDefault in the wrapper chain and return its default value
 */
const findDefaultValue = (field: unknown): any | undefined => {
  let current = field;
  const visited = new Set<unknown>();

  while (current && !visited.has(current)) {
    visited.add(current);
    const currentWithDef = current as {
      _def?: {
        typeName?: string;
        defaultValue?: () => any;
        innerType?: unknown;
      };
    };

    if (!currentWithDef._def?.typeName) break;

    if (currentWithDef._def.typeName === 'ZodDefault') {
      return currentWithDef._def.defaultValue?.();
    }

    // Continue unwrapping if it's a wrapper type
    if (
      currentWithDef._def.typeName === 'ZodOptional' ||
      currentWithDef._def.typeName === 'ZodNullable'
    ) {
      current = currentWithDef._def.innerType;
    } else {
      break;
    }
  }

  return undefined;
};

type ActionParamDescription = {
  type: string;
  optional?: true;
  description?: string;
  default?: unknown;
  instruction?: string;
};

type ActionDescription = {
  type: string;
  description: string;
  param?: Record<string, ActionParamDescription> | ActionParamDescription;
  sample?: string;
};

export const buildActionDescription = (
  action: DeviceAction<any>,
  {
    includeLocateInPlanning = false,
    locatePromptSpec,
  }: {
    includeLocateInPlanning?: boolean;
    locatePromptSpec?: LocateResultPromptSpec;
  } = {},
) => {
  const locateParamTypeDescription = locateParamSchemaDescription(
    includeLocateInPlanning ? locatePromptSpec : undefined,
  );
  const actionDescription: ActionDescription = {
    type: action.name,
    description: action.description || 'No description provided',
  };

  // Handle paramSchema if it exists
  if (action.paramSchema) {
    // Check if paramSchema is a ZodObject with shape
    const schema = action.paramSchema as {
      _def?: { typeName?: string };
      shape?: Record<string, unknown>;
    };
    const isZodObject = schema._def?.typeName === 'ZodObject';

    if (isZodObject && schema.shape) {
      const shape = schema.shape;
      const param: Record<string, ActionParamDescription> = {};

      for (const [key, field] of Object.entries(shape)) {
        if (field && typeof field === 'object') {
          // Check if field is optional
          const isOptional =
            typeof (field as { isOptional?: () => boolean }).isOptional ===
              'function' &&
            (field as { isOptional: () => boolean }).isOptional();
          const typeName = getZodTypeName(field, locateParamTypeDescription);
          const description = getZodDescription(field as z.ZodTypeAny);
          const defaultValue = findDefaultValue(field);
          const hasDefault = defaultValue !== undefined;

          const paramDescription: ActionParamDescription = {
            type: typeName,
          };
          if (isOptional) {
            paramDescription.optional = true;
          }
          if (description) {
            paramDescription.description = description;
          }
          if (hasDefault) {
            paramDescription.default = defaultValue;
          }

          param[key] = paramDescription;
        }
      }

      if (Object.keys(param).length > 0) {
        actionDescription.param = param;
      }
    } else {
      const typeName = getZodTypeName(schema);
      const description = getZodDescription(schema as z.ZodTypeAny);
      const paramDescription: ActionParamDescription = {
        type: typeName,
        instruction: 'Pass the value directly, not as an object.',
      };
      if (description) {
        paramDescription.description = description;
      }
      actionDescription.param = paramDescription;
    }
  }

  const actionExample = buildActionExample(
    action,
    includeLocateInPlanning ? locatePromptSpec : undefined,
  );
  if (actionExample) {
    actionDescription.sample = actionExample;
  }

  return actionDescription;
};

export const buildActionSpaceDescription = (
  actionSpace: DeviceAction<any>[],
  options: {
    includeLocateInPlanning?: boolean;
    locatePromptSpec?: LocateResultPromptSpec;
  } = {},
) =>
  yaml
    .dump(
      actionSpace.map((action) => buildActionDescription(action, options)),
      {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      },
    )
    .trim();
