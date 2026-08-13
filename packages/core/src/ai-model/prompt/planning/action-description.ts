import { findAllMidsceneLocatorField } from '@/common';
import type { DeviceAction } from '@/types';
import {
  getZodDescription,
  getZodTypeName,
} from '@midscene/shared/zod-schema-utils';
import type { z } from 'zod';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';

export const locateParamSchemaDescription = (
  promptSpec?: LocateResultPromptSpec,
) => {
  if (promptSpec) {
    return `{${promptSpec.resultKey}: ${promptSpec.resultValueSchema}, prompt: string } // ${promptSpec.resultValueDescription}`;
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

/**
 * Inject model locate results into locate fields of a sample object.
 * Walks the sample and for any locate field (identified by paramSchema),
 * adds a fake locate result when includeLocateInPlanning is true.
 */
const injectLocateResultIntoSample = (
  sample: Record<string, any>,
  locateFields: string[],
  promptSpec: LocateResultPromptSpec,
): Record<string, any> => {
  const resultKey = promptSpec.resultKey;
  const sampleResults = promptSpec.exampleValues;
  const result = { ...sample };
  let sampleResultIndex = 0;
  for (const field of locateFields) {
    if (
      result[field] &&
      typeof result[field] === 'object' &&
      result[field].prompt
    ) {
      result[field] = {
        ...result[field],
        [resultKey]: sampleResults[sampleResultIndex % sampleResults.length],
      };
      sampleResultIndex++;
    }
  }
  return result;
};

export const descriptionForAction = (
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
  const tab = '  ';
  const fields: string[] = [];

  // Add the action type field
  fields.push(`- type: "${action.name}"`);

  // Handle paramSchema if it exists
  if (action.paramSchema) {
    const paramLines: string[] = [];

    // Check if paramSchema is a ZodObject with shape
    const schema = action.paramSchema as {
      _def?: { typeName?: string };
      shape?: Record<string, unknown>;
    };
    const isZodObject = schema._def?.typeName === 'ZodObject';

    if (isZodObject && schema.shape) {
      // Original logic for ZodObject schemas
      const shape = schema.shape;

      for (const [key, field] of Object.entries(shape)) {
        if (field && typeof field === 'object') {
          // Check if field is optional
          const isOptional =
            typeof (field as { isOptional?: () => boolean }).isOptional ===
              'function' &&
            (field as { isOptional: () => boolean }).isOptional();
          const keyWithOptional = isOptional ? `${key}?` : key;

          // Get the type name using extracted helper
          const typeName = getZodTypeName(field, locateParamTypeDescription);

          // Get description using extracted helper
          const description = getZodDescription(field as z.ZodTypeAny);

          // Check if field has a default value by searching the wrapper chain
          const defaultValue = findDefaultValue(field);
          const hasDefault = defaultValue !== undefined;

          // Build param line for this field
          let paramLine = `${keyWithOptional}: ${typeName}`;
          const comments: string[] = [];
          if (description) {
            comments.push(description);
          }
          if (hasDefault) {
            const defaultStr =
              typeof defaultValue === 'string'
                ? `"${defaultValue}"`
                : JSON.stringify(defaultValue);
            comments.push(`default: ${defaultStr}`);
          }
          if (comments.length > 0) {
            paramLine += ` // ${comments.join(', ')}`;
          }

          paramLines.push(paramLine);
        }
      }

      // Add the param section to fields if there are paramLines
      if (paramLines.length > 0) {
        fields.push('- param:');
        paramLines.forEach((line) => {
          fields.push(`  - ${line}`);
        });
      }
    } else {
      // Handle non-object schemas (string, number, etc.)
      const typeName = getZodTypeName(schema);
      const description = getZodDescription(schema as z.ZodTypeAny);

      // For simple types, indicate that param should be the direct value, not an object
      let paramDescription = `- param: ${typeName}`;
      if (description) {
        paramDescription += ` // ${description}`;
      }
      paramDescription += ' (pass the value directly, not as an object)';

      fields.push(paramDescription);
    }
  }

  // Render sample if provided, using the same XML tag format as the real output
  if (action.sample && typeof action.sample === 'object') {
    const locateFields = findAllMidsceneLocatorField(action.paramSchema);
    const sampleWithLocateResult =
      includeLocateInPlanning && locatePromptSpec
        ? injectLocateResultIntoSample(
            action.sample,
            locateFields,
            locatePromptSpec,
          )
        : action.sample;
    const sampleStr = `- sample:\n${tab}${tab}<action-type>${action.name}</action-type>\n${tab}${tab}<action-param-json>\n${tab}${tab}${JSON.stringify(sampleWithLocateResult, null, 2).replace(/\n/g, `\n${tab}${tab}`)}\n${tab}${tab}</action-param-json>`;
    fields.push(sampleStr);
  }

  return `- ${action.name}, ${action.description || 'No description provided'}
${tab}${fields.join(`\n${tab}`)}
`.trim();
};

export const buildActionSpaceDescription = (
  actionSpace: DeviceAction<any>[],
  options: {
    includeLocateInPlanning?: boolean;
    locatePromptSpec?: LocateResultPromptSpec;
  } = {},
) =>
  actionSpace.map((action) => descriptionForAction(action, options)).join('\n');
