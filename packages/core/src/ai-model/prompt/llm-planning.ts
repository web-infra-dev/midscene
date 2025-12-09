import type { DeviceAction } from '@/types';
import type { TVlModeTypes } from '@midscene/shared/env';
import {
  getZodDescription,
  getZodTypeName,
} from '@midscene/shared/zod-schema-utils';
import type { ResponseFormatJSONSchema } from 'openai/resources/index';
import type { z } from 'zod';
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
- Assertions are also important steps. When getting the assertion instruction, a solid conclusion is required. You should explicitly state your conclusion by calling the "Print_Assert_Result" action.

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
      "type": string, // the type of the action
      "param"?: { // The parameter of the action, if any
         // k-v style parameter fields
      }, 
    } | null,
  ,
  "sleep"?: number, // The sleep time after the action, in milliseconds.
}

For example, if the instruction is to login and the form has already been filled, this is a valid return value:

{
  "log": "Click the login button",
  "more_actions_needed_by_instruction": false,
  "action": {
    "type": "Tap",
    "param": {
      "locate": { 
        "prompt": "The login button"${vlMode ? `, "bbox": [100, 200, 300, 400]` : ''}
      }
    }
  }
`;
}
