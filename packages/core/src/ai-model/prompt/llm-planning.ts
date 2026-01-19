import type { DeviceAction } from '@/types';
import type { TModelFamily } from '@midscene/shared/env';
import { getPreferredLanguage } from '@midscene/shared/env';
import {
  getZodDescription,
  getZodTypeName,
} from '@midscene/shared/zod-schema-utils';
import type { ResponseFormatJSONSchema } from 'openai/resources/index';
import type { z } from 'zod';
import { bboxDescription } from './common';

// Note: put the log field first to trigger the CoT

const buildCommonOutputFields = (
  includeThought: boolean,
  preferredLanguage: string,
) => {
  const fields = [
    `"note"?: string, // CRITICAL: If any information from the current screenshot will be needed in follow-up actions, you MUST record it here completely. The current screenshot will NOT be available in subsequent steps, so this note is your only way to preserve essential information for later use. Examples: extracted data, element states, content that needs to be referenced. Use ${preferredLanguage}.`,
    `"log": string, // a brief preamble to the user explaining what you're about to do. Use ${preferredLanguage}.`,
    `"error"?: string, // Error messages about unexpected situations, if any. Only think it is an error when the situation is not foreseeable according to the instruction. Use ${preferredLanguage}.`,
  ];

  if (includeThought) {
    fields.unshift(
      `"thought": string, // your thought process about the next action`,
    );
  }

  return fields.join('\n  ');
};

const vlLocateParam = (modelFamily: TModelFamily | undefined) => {
  if (modelFamily) {
    return `{bbox: [number, number, number, number], prompt: string } // ${bboxDescription(modelFamily)}`;
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
          const typeName = getZodTypeName(field, locatorSchemaTypeDescription);

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

  return `- ${action.name}, ${action.description || 'No description provided'}
${tab}${fields.join(`\n${tab}`)}
`.trim();
};

export async function systemPromptToTaskPlanning({
  actionSpace,
  modelFamily,
  includeBbox,
  includeThought,
}: {
  actionSpace: DeviceAction<any>[];
  modelFamily: TModelFamily | undefined;
  includeBbox: boolean;
  includeThought?: boolean;
}) {
  const preferredLanguage = getPreferredLanguage();

  // Validate parameters: if includeBbox is true, modelFamily must be defined
  if (includeBbox && !modelFamily) {
    throw new Error(
      'modelFamily cannot be undefined when includeBbox is true. A valid modelFamily is required for bbox-based location.',
    );
  }

  const actionDescriptionList = actionSpace.map((action) => {
    return descriptionForAction(
      action,
      vlLocateParam(includeBbox ? modelFamily : undefined),
    );
  });
  const actionList = actionDescriptionList.join('\n');

  const logFieldInstruction = `
## About the \`log\` field (preamble message)

The \`log\` field is a brief preamble message to the user explaining what you're about to do. It should follow these principles and examples:

- **Use ${preferredLanguage}**
- **Keep it concise**: be no more than 1-2 sentences, focused on immediate, tangible next steps. (8–12 words or Chinese characters for quick updates).
- **Build on prior context**: if this is not the first action to be done, use the preamble message to connect the dots with what’s been done so far and create a sense of momentum and clarity for the user to understand your next actions.
- **Keep your tone light, friendly and curious**: add small touches of personality in preambles feel collaborative and engaging.

**Examples:**
- "Click the login button"
- "Scroll to find the 'Yes' button in popup"
- "Previous actions failed to find the 'Yes' button, i will try again"
- "Go back to find the login button"
`;

  const shouldIncludeThought = includeThought ?? true;
  const commonOutputFields = buildCommonOutputFields(
    shouldIncludeThought,
    preferredLanguage,
  );
  const exampleThoughtLine = shouldIncludeThought
    ? `  "thought": "The form has already been filled, I need to click the login button to login",
`
    : '';
  const exampleThoughtLineWithNote = shouldIncludeThought
    ? `  "thought": "I need to note the titles in the current screenshot for further processing and scroll to find more titles",
`
    : '';

  return `
Target: User will give you an instruction, some screenshots and previous logs indicating what have been done. Your task is to plan the next one action according to current situation to accomplish the instruction.

Please tell what the next one action is (or null if no action should be done) to do the tasks the instruction requires. 

## Rules

- Don't give extra actions or plans beyond the instruction. For example, don't try to submit the form if the instruction is only to fill something.
- Give just the next ONE action you should do
- Consider the current screenshot and give the action that is most likely to accomplish the instruction. For example, if the next step is to click a button but it's not visible in the screenshot, you should try to find it first instead of give a click action.
- Make sure the previous actions are completed successfully before performing the next step
- If there are some error messages reported by the previous actions, don't give up, try parse a new action to recover. If the error persists for more than 5 times, you should think this is an error and set the "error" field to the error message.
- Assertions are also important steps. When getting the assertion instruction, a solid conclusion is required. You should explicitly state your conclusion by calling the "Print_Assert_Result" action.

## Supporting actions
${actionList}

${logFieldInstruction}

## Return format

Return in XML format with the following structure:
${shouldIncludeThought ? '<thought>your thought process about the next action</thought>' : ''}
<note>CRITICAL: If any information from the current screenshot will be needed in follow-up actions, you MUST record it here completely. The current screenshot will NOT be available in subsequent steps, so this note is your only way to preserve essential information for later use. Examples: extracted data, element states, content that needs to be referenced. Leave empty if no follow-up information is needed.</note>
<log>a brief preamble to the user</log>
<error>error messages (optional)</error>
<action-type>the type of the action, or null if no action</action-type>
<action-param-json>JSON object containing the action parameters</action-param-json>

For example, if the instruction is to login and the form has already been filled, this is a valid return value:

${shouldIncludeThought ? '<thought>The form has already been filled, I need to click the login button to login</thought>' : ''}<log>Click the login button</log>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "The login button"${modelFamily && includeBbox ? `, "bbox": [100, 200, 300, 400]` : ''}
  }
}
</action-param-json>

For example, if the instruction is to find out every title in the screenshot, the return value should be:

${shouldIncludeThought ? '<thought>I need to note the titles in the current screenshot for further processing and scroll to find more titles</thought>' : ''}<note>The titles in the current screenshot are: 'Hello, world!', 'Midscene 101', 'Model strategy'</note>
<log>Scroll to find more titles</log>
<action-type>Scroll</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "The page content area"
  },
  "direction": "down"
}
</action-param-json>
`;
}
