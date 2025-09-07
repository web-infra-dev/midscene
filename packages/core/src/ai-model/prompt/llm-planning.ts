import assert from 'node:assert';
import type { DeviceAction } from '@/types';
import { PromptTemplate } from '@langchain/core/prompts';
import type { TVlModeTypes } from '@midscene/shared/env';
import type { ResponseFormatJSONSchema } from 'openai/resources/index';
import type { ZodObject, z } from 'zod';
import { ifMidsceneLocatorField } from '../common';
import { bboxDescription } from './common';

// Note: put the log field first to trigger the CoT
const vlCoTLog = `"what_the_user_wants_to_do_next_by_instruction": string, // What the user wants to do according to the instruction and previous logs. `;
const vlCurrentLog = `"log": string, // Log what the next one action (ONLY ONE!) you can do according to the screenshot and the instruction. The typical log looks like "Now i want to use action '{ action-type }' to do .. first". If no action should be done, log the reason. ". Use the same language as the user's instruction.`;
const llmCurrentLog = `"log": string, // Log what the next actions you can do according to the screenshot and the instruction. The typical log looks like "Now i want to use action '{ action-type }' to do ..". If no action should be done, log the reason. ". Use the same language as the user's instruction.`;

const commonOutputFields = `"error"?: string, // Error messages about unexpected situations, if any. Only think it is an error when the situation is not foreseeable according to the instruction. Use the same language as the user's instruction.
  "more_actions_needed_by_instruction": boolean, // Consider if there is still more action(s) to do after the action in "Log" is done, according to the instruction. If so, set this field to true. Otherwise, set it to false.`;
const vlLocateParam = () =>
  '{bbox: [number, number, number, number], prompt: string }';
const llmLocateParam = () => '{"id": string, "prompt": string}';

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
    assert(
      action.paramSchema.constructor.name === 'ZodObject',
      'paramSchema must be a zod object',
    );
    // Try to extract parameter information from the zod schema
    // For zod object schemas, extract type information and descriptions
    const shape = (action.paramSchema as ZodObject<any>).shape;
    const paramLines: string[] = [];

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

    if (paramLines.length > 0) {
      fields.push('- param:');
      for (const paramLine of paramLines) {
        fields.push(`  - ${paramLine}`);
      }
    }
  }

  return `- ${action.name}, ${action.description || 'No description provided'}
${tab}${fields.join(`\n${tab}`)}
`.trim();
};

const systemTemplateOfVLPlanning = ({
  actionSpace,
  vlMode,
}: {
  actionSpace: DeviceAction<any>[];
  vlMode: TVlModeTypes | undefined;
}) => {
  const actionNameList = actionSpace.map((action) => action.name).join(', ');
  const actionDescriptionList = actionSpace.map((action) => {
    return descriptionForAction(action, vlLocateParam());
  });
  const actionList = actionDescriptionList.join('\n');

  return `
Target: User will give you a screenshot, an instruction and some previous logs indicating what have been done. Please tell what the next one action is (or null if no action should be done) to do the tasks the instruction requires. 

Restriction:
- Don't give extra actions or plans beyond the instruction. ONLY plan for what the instruction requires. For example, don't try to submit the form if the instruction is only to fill something.
- Always give ONLY ONE action in \`log\` field (or null if no action should be done), instead of multiple actions. Supported actions are ${actionNameList}.
- Don't repeat actions in the previous logs.
- Bbox is the bounding box of the element to be located. It's an array of 4 numbers, representing ${bboxDescription(vlMode)}.

Supporting actions:
${actionList}

Field description:
* The \`prompt\` field inside the \`locate\` field is a short description that could be used to locate the element.

Return in JSON format:
{
  ${vlCoTLog}
  ${vlCurrentLog}
  ${commonOutputFields}
  "action": 
    {
      // one of the supporting actions
    } | null,
  ,
  "sleep"?: number, // The sleep time after the action, in milliseconds.
}

For example, when the instruction is "click 'Confirm' button, and click 'Yes' in popup" and the log is "I will use action Tap to click 'Confirm' button", by viewing the screenshot and previous logs, you should consider: We have already clicked the 'Confirm' button, so next we should find and click 'Yes' in popup.

this and output the JSON:

{
  "what_the_user_wants_to_do_next_by_instruction": "We have already clicked the 'Confirm' button, so next we should find and click 'Yes' in popup",
  "log": "I will use action Tap to click 'Yes' in popup",
  "more_actions_needed_by_instruction": false,
  "action": {
    "type": "Tap",
    "param": {
      "locate": {
        "bbox": [100, 100, 200, 200],
        "prompt": "The 'Yes' button in popup"
      }
    }
  }
}
`;
};

const systemTemplateOfLLM = ({
  actionSpace,
}: { actionSpace: DeviceAction<any>[] }) => {
  const actionNameList = actionSpace.map((action) => action.name).join(' / ');
  const actionDescriptionList = actionSpace.map((action) => {
    return descriptionForAction(action, llmLocateParam());
  });
  const actionList = actionDescriptionList.join('\n');

  return `
## Role

You are a versatile professional in software UI automation. Your outstanding contributions will impact the user experience of billions of users.

## Objective

- Decompose the instruction user asked into a series of actions
- Locate the target element if possible
- If the instruction cannot be accomplished, give a further plan.

## Workflow

1. Receive the screenshot, element description of screenshot(if any), user's instruction and previous logs.
2. Decompose the user's task into a sequence of feasible actions, and place it in the \`actions\` field. There are different types of actions (${actionNameList}). The "About the action" section below will give you more details.
3. Consider whether the user's instruction will be accomplished after the actions you composed.
- If the instruction is accomplished, set \`more_actions_needed_by_instruction\` to false.
- If more actions are needed, set \`more_actions_needed_by_instruction\` to true. Get ready to hand over to the next talent people like you. Carefully log what have been done in the \`log\` field, he or she will continue the task according to your logs.
4. If the task is not feasible on this page, set \`error\` field to the reason.

## Constraints

- All the actions you composed MUST be feasible, which means all the action fields can be filled with the page context information you get. If not, don't plan this action.
- Trust the "What have been done" field about the task (if any), don't repeat actions in it.
- Respond only with valid JSON. Do not write an introduction or summary or markdown prefix like \`\`\`json\`\`\`.
- If the screenshot and the instruction are totally irrelevant, set reason in the \`error\` field.

## About the \`actions\` field

The \`locate\` param is commonly used in the \`param\` field of the action, means to locate the target element to perform the action, it conforms to the following scheme:

type LocateParam = {
  "id": string, // the id of the element found. It should either be the id marked with a rectangle in the screenshot or the id described in the description.
  "prompt"?: string // the description of the element to find. It can only be omitted when locate is null.
} | null // If it's not on the page, the LocateParam should be null

## Supported actions

Each action has a \`type\` and corresponding \`param\`. To be detailed:
${actionList}

`.trim();
};

const outputTemplate = `
## Output JSON Format:

The JSON format is as follows:

{
  "actions": [
    // ... some actions
  ],
  ${llmCurrentLog}
  ${commonOutputFields}
}

## Examples

### Example: Decompose a task

When you received the following information:

* Instruction: 'Click the language switch button, wait 1s, click "English"'
* Logs: null
* Page Context (screenshot and description) shows: There is a language switch button, and the "English" option is not shown in the screenshot now.

By viewing the page screenshot and description, you should consider this and output the JSON:

* The user intent is: tap the switch button, sleep, and tap the 'English' option
* The language switch button is shown in the screenshot, and can be located by the page description or the id marked with a rectangle. So we can plan a Tap action to do this.
* Plan a Sleep action to wait for 1 second to ensure the language options are displayed.
* The "English" option button is not shown in the screenshot now, it means it may only show after the previous actions are finished. So don't plan any action to do this.
* Log what these action do: Click the language switch button to open the language options. Wait for 1 second.
* The task cannot be accomplished (because the last tapping action is not finished yet), so the \`more_actions_needed_by_instruction\` field is true. The \`error\` field is null.

{
  "actions":[
    {
      "thought": "Click the language switch button to open the language options.",
      "type": "Tap", 
      "param": {
        "locate": { id: "c81c4e9a33", prompt: "The language switch button" }
      }
    },
    {
      "thought": "Wait for 1 second to ensure the language options are displayed.",
      "type": "Sleep",
      "param": { "timeMs": 1000 },
    }
  ],
  "error": null,
  "more_actions_needed_by_instruction": true,
  "log": "Click the language switch button to open the language options. Wait for 1 second",
}

### Example: What NOT to do
Wrong output:
{
  "actions":[
    {
      "thought": "Click the language switch button to open the language options.",
      "type": "Tap",
      "param": {
        "locate": { "id": "c81c4e9a33" } // WRONG: prompt is missing, this is not a valid LocateParam
      }
    },
    {
      "thought": "Click the English option",
      "type": "Tap", 
      "param": {
        "locate": null // WRONG: if the element is not on the page, you should not plan this action
      }
    }
  ],
  "more_actions_needed_by_instruction": false, // WRONG: should be true
  "log": "Click the language switch button to open the language options",
}
`;

export async function systemPromptToTaskPlanning({
  actionSpace,
  vlMode,
}: {
  actionSpace: DeviceAction<any>[];
  vlMode: TVlModeTypes | undefined;
}) {
  if (vlMode) {
    return systemTemplateOfVLPlanning({ actionSpace, vlMode });
  }

  return `${systemTemplateOfLLM({ actionSpace })}\n\n${outputTemplate}`;
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

export const generateTaskBackgroundContext = (
  userInstruction: string,
  log?: string,
  userActionContext?: string,
) => {
  if (log) {
    return `
Here is the user's instruction:

<instruction>
  <high_priority_knowledge>
    ${userActionContext}
  </high_priority_knowledge>

  ${userInstruction}
</instruction>

These are the logs from previous executions, which indicate what was done in the previous actions.
Do NOT repeat these actions.
<previous_logs>
${log}
</previous_logs>
`;
  }

  return `
Here is the user's instruction:
<instruction>
  <high_priority_knowledge>
    ${userActionContext}
  </high_priority_knowledge>

  ${userInstruction}
</instruction>
`;
};

export const automationUserPrompt = (vlMode: TVlModeTypes | undefined) => {
  if (vlMode) {
    return new PromptTemplate({
      template: '{taskBackgroundContext}',
      inputVariables: ['taskBackgroundContext'],
    });
  }

  return new PromptTemplate({
    template: `
pageDescription:
=====================================
{pageDescription}
=====================================

{taskBackgroundContext}`,
    inputVariables: ['pageDescription', 'taskBackgroundContext'],
  });
};
