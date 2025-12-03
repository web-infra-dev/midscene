import type { DeviceAction } from '@/types';
import type { TVlModeTypes } from '@midscene/shared/env';
import type { ResponseFormatJSONSchema } from 'openai/resources/index';
import type { z } from 'zod';
import { ifMidsceneLocatorField } from '../../common';
import { bboxDescription } from './common';

// Note: put the log field first to trigger the CoT

const commonOutputFields = `"error"?: string, // Error messages about unexpected situations, if any. Only think it is an error when the situation is not foreseeable according to the instruction. Use the same language as the user's instruction.
  "more_actions_needed_by_instruction": boolean, // Consider if there is still more action(s) to do after the action in "Log" is done, according to the instruction. If so, set this field to true. Otherwise, set it to false.`;

const vlLocateParam = (vlMode: TVlModeTypes | undefined) => {
  if (vlMode) {
    return `{bbox: [number, number, number, number], prompt: string } // ${bboxDescription(vlMode)}`;
  }
  return '{ prompt: string /* description of the target element */ }';
};

export const descriptionForAction = (
  action: DeviceAction<any>,
  locatorSchemaTypeDescription: string,
) => {
  const tab = '  ';
  const fields: string[] = [];

  // Add the action type field
  fields.push(`- type: "${action.name}"`);

  // Handle paramSchema if it exists
  if (action.paramSchema) {
    const paramLines: string[] = [];

    // Check if paramSchema is a ZodObject with shape
    const schema = action.paramSchema as any;
    const isZodObject = schema._def?.typeName === 'ZodObject';

    if (isZodObject && schema.shape) {
      // Original logic for ZodObject schemas
      const shape = schema.shape;

      // Helper function to get type name from zod schema
      const getTypeName = (field: any): string => {
        // Recursively unwrap optional, nullable, and other wrapper types to get the actual inner type
        const unwrapField = (f: any): any => {
          if (!f._def) return f;

          const typeName = f._def.typeName;

          // Handle wrapper types that have innerType
          if (
            typeName === 'ZodOptional' ||
            typeName === 'ZodNullable' ||
            typeName === 'ZodDefault'
          ) {
            return unwrapField(f._def.innerType);
          }

          // Handle ZodEffects (transformations, refinements, preprocessors)
          if (typeName === 'ZodEffects') {
            // For ZodEffects, unwrap the schema field which contains the underlying type
            if (f._def.schema) {
              return unwrapField(f._def.schema);
            }
          }

          return f;
        };

        const actualField = unwrapField(field);
        const fieldTypeName = actualField._def?.typeName;

        if (fieldTypeName === 'ZodString') return 'string';
        if (fieldTypeName === 'ZodNumber') return 'number';
        if (fieldTypeName === 'ZodBoolean') return 'boolean';
        if (fieldTypeName === 'ZodArray') return 'array';
        if (fieldTypeName === 'ZodObject') {
          // Check if this is a passthrough object (like MidsceneLocation)
          if (ifMidsceneLocatorField(actualField)) {
            return locatorSchemaTypeDescription;
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
        // Handle ZodUnion by taking the first option (for display purposes)
        if (fieldTypeName === 'ZodUnion') {
          const options = actualField._def?.options as any[] | undefined;
          if (options && options.length > 0) {
            // For unions, list all types
            const types = options.map((opt: any) => getTypeName(opt));
            return types.join(' | ');
          }
          return 'union';
        }

        console.warn(
          'failed to parse Zod type. This may lead to wrong params from the LLM.\n',
          actualField._def,
        );
        return actualField.toString();
      };

      // Helper function to get description from zod schema
      const getDescription = (field: z.ZodTypeAny): string | null => {
        // Recursively unwrap optional, nullable, and other wrapper types to get the actual inner type
        const unwrapField = (f: any): any => {
          if (!f._def) return f;

          const typeName = f._def.typeName;

          // Handle wrapper types that have innerType
          if (
            typeName === 'ZodOptional' ||
            typeName === 'ZodNullable' ||
            typeName === 'ZodDefault'
          ) {
            return unwrapField(f._def.innerType);
          }

          // Handle ZodEffects (transformations, refinements, preprocessors)
          if (typeName === 'ZodEffects') {
            // For ZodEffects, unwrap the schema field which contains the underlying type
            if (f._def.schema) {
              return unwrapField(f._def.schema);
            }
          }

          return f;
        };

        // Check for direct description on the original field (wrapper may have description)
        if ('description' in field) {
          return field.description || null;
        }

        const actualField = unwrapField(field);

        // Check for description on the unwrapped field
        if ('description' in actualField) {
          return actualField.description || null;
        }

        // Check for MidsceneLocation fields and add description
        if (actualField._def?.typeName === 'ZodObject') {
          if ('midscene_location_field_flag' in actualField._def.shape()) {
            return 'Location information for the target element';
          }
        }

        return null;
      };

      for (const [key, field] of Object.entries(shape)) {
        if (field && typeof field === 'object') {
          // Check if field is optional
          const isOptional =
            typeof (field as any).isOptional === 'function' &&
            (field as any).isOptional();
          const keyWithOptional = isOptional ? `${key}?` : key;

          // Get the type name
          const typeName = getTypeName(field);

          // Get description
          const description = getDescription(field as z.ZodTypeAny);

          // Build param line for this field
          let paramLine = `${keyWithOptional}: ${typeName}`;
          if (description) {
            paramLine += ` // ${description}`;
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
      // For simple primitive types, the param should be passed directly as the value
      const schemaTypeName = schema._def?.typeName;
      let typeName = 'unknown';

      if (schemaTypeName === 'ZodString') typeName = 'string';
      else if (schemaTypeName === 'ZodNumber') typeName = 'number';
      else if (schemaTypeName === 'ZodBoolean') typeName = 'boolean';

      // Get description if available
      const description = 'description' in schema ? schema.description : null;

      // For simple types, indicate that param should be the direct value, not an object
      let paramDescription = `- param: ${typeName}`;
      if (description) {
        paramDescription += ` // ${description}`;
      }
      paramDescription += ' (pass the value directly, not as an object)';

      fields.push(paramDescription);
    }
  }

  return `- ${action.name}, ${action.description || 'No description provided'}
${tab}${fields.join(`\n${tab}`)}
`.trim();
};

export async function systemPromptToTaskPlanning({
  actionSpace,
  vlMode,
  includeBbox,
}: {
  actionSpace: DeviceAction<any>[];
  vlMode: TVlModeTypes | undefined;
  includeBbox: boolean;
}) {
  // Validate parameters: if includeBbox is true, vlMode must be defined
  if (includeBbox && !vlMode) {
    throw new Error(
      'vlMode cannot be undefined when includeBbox is true. A valid vlMode is required for bbox-based location.',
    );
  }

  const actionDescriptionList = actionSpace.map((action) => {
    return descriptionForAction(
      action,
      vlLocateParam(includeBbox ? vlMode : undefined),
    );
  });
  const actionList = actionDescriptionList.join('\n');

  const logFieldInstruction = `
## About the \`log\` field (preamble message)

The \`log\` field is a brief preamble message to the user explaining what you’re about to do. It should follow these principles and examples:

- **Use the same language as the user's instruction**
- **Keep it concise**: be no more than 1-2 sentences, focused on immediate, tangible next steps. (8–12 words or Chinese characters for quick updates).
- **Build on prior context**: if this is not the first action to be done, use the preamble message to connect the dots with what’s been done so far and create a sense of momentum and clarity for the user to understand your next actions.
- **Keep your tone light, friendly and curious**: add small touches of personality in preambles feel collaborative and engaging.

**Examples:**
- "Click the login button"
- "Scroll to find the 'Yes' button in popup"
- "Previous actions failed to find the 'Yes' button, i will try again"
- "Go back to find the login button"
`;

  return `
Target: User will give you an instruction, some screenshots and previous logs indicating what have been done. Your task is to plan the next one action according to current situation to accomplish the instruction.

Please tell what the next one action is (or null if no action should be done) to do the tasks the instruction requires. 

## Rules

- Don't give extra actions or plans beyond the instruction. For example, don't try to submit the form if the instruction is only to fill something.
- Give just the next ONE action you should do
- Consider the current screenshot and give the action that is most likely to accomplish the instruction. For example, if the next step is to click a button but it's not visible in the screenshot, you should try to find it first instead of give a click action.
- Make sure the previous actions are completed successfully before performing the next step
- If there are some error messages reported by the previous actions, don't give up, try parse a new action to recover. If the error persists for more than 5 times, you should think this is an error and set the "error" field to the error message.
- If there is nothing to do but waiting, set the "sleep" field to the positive waiting time in milliseconds and null for the "action" field.
- When the next step is to assert something, this is a very important step, you should think about it carefully and give a solid result. Write your result in the "log" field like this: "Assert: <condition>. I think <...>, so the result is <true / false>". You don't need to give the next one action when you are asserting something. If the assertion result is false, think this an fatal error and set the reason into the "error" field. If the assertion result is true, you can continue to the next step.

## Supporting actions
${actionList}

${logFieldInstruction}

## Return format

Return in JSON format:
{
  "log": string, // a brief preamble to the user explaining what you’re about to do
  ${commonOutputFields}
  "action": 
    {
      // one of the supporting actions
    } | null,
  ,
  "sleep"?: number, // The sleep time after the action, in milliseconds.
}
`;
}

export const planSchema: ResponseFormatJSONSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'action_items',
    strict: false,
    schema: {
      type: 'object',
      strict: false,
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            strict: false,
            properties: {
              thought: {
                type: 'string',
                description:
                  'Reasons for generating this task, and why this task is feasible on this page',
              },
              type: {
                type: 'string',
                description: 'Type of action',
              },
              param: {
                anyOf: [
                  { type: 'null' },
                  {
                    type: 'object',
                    additionalProperties: true,
                  },
                ],
                description: 'Parameter of the action',
              },
              locate: {
                type: ['object', 'null'],
                properties: {
                  id: { type: 'string' },
                  prompt: { type: 'string' },
                },
                required: ['id', 'prompt'],
                additionalProperties: false,
                description: 'Location information for the target element',
              },
            },
            required: ['thought', 'type', 'param', 'locate'],
            additionalProperties: false,
          },
          description: 'List of actions to be performed',
        },
        more_actions_needed_by_instruction: {
          type: 'boolean',
          description:
            'If all the actions described in the instruction have been covered by this action and logs, set this field to false.',
        },
        log: {
          type: 'string',
          description:
            'Log what these planned actions do. Do not include further actions that have not been planned.',
        },
        error: {
          type: ['string', 'null'],
          description: 'Error messages about unexpected situations',
        },
      },
      required: [
        'actions',
        'more_actions_needed_by_instruction',
        'log',
        'error',
      ],
      additionalProperties: false,
    },
  },
};
