import {
  MATCH_BY_POSITION,
  MIDSCENE_USE_QWEN_VL,
  getAIConfigInBoolean,
} from '@/env';
import { PromptTemplate } from '@langchain/core/prompts';
import type { ResponseFormatJSONSchema } from 'openai/resources';
import { samplePageDescription } from './util';

const systemTemplateOfQwen = `
Target: User will give you a screenshot, an instruction and some previous logs indicating what have been done. Please tell what the next action is to finish the instruction.

Supporting actions:
- Tap: { type: "Tap", locate: {"bbox": [number, number, number, number] } }
- Hover: { type: "Hover", locate: {"bbox": [number, number, number, number] } }
- Input: { type: "Input", locate: {"bbox": [number, number, number, number] }, param: { value: string } } // \`value\` is the final that should be filled in the input box. No matter what modifications are required, just provide the final value to replace the existing input value. 
- KeyboardPress: { type: "KeyboardPress", param: { value: string } }
- Scroll: { type: "Scroll",   locate: {"bbox": [number, number, number, number] } | null, param: { direction: 'down'(default) | 'up' | 'right' | 'left', scrollType: 'once' (default) | 'untilBottom' | 'untilTop' | 'untilRight' | 'untilLeft', distance: null | number }}
- ExpectedFalsyCondition: { type: "ExpectedFalsyCondition", param: null } // Use this action when the conditional statement talked about in the instruction is falsy.

Return in JSON format:
{
  "action": 
    {
      // one of the supporting actions
    },
  ,
  "finish": boolean, // Whether the instruction is finished after the action.
  "sleep"?: number, // The sleep time after the action, in milliseconds.
  "log": string, // Log what have been done in this action. Use the same language as the user's instruction.
  "error"?: string // Error messages about unexpected situations, if any. Use the same language as the user's instruction.
}
`;

const systemTemplate = `
## Role

You are a versatile professional in software UI automation. Your outstanding contributions will impact the user experience of billions of users.

## Objective

- Follow the instruction from user and previous logs, then tell what to do next

## Workflow

1. Receive the screenshot, element description of screenshot(if any), user's instruction and previous logs.
2. Decompose the instruction and previous logs, give the next action to do, and place it in the \`action\` field. There are different types of actions (Tap / Hover / Input / KeyboardPress / Scroll / ExpectedFalsyCondition). The "About the action" section below will give you more details.
3. If the action you just planned is the last action to finish the instruction (or no more actions needed), set \`finish\` to true.
4. If you cannot plan any action, and this is also not expected by the user's instruction, set the reason in the \`error\` field.

## Constraints

- The action you composed MUST be based on the page context information you get.
- Trust the logs about the task (if any), don't repeat actions in it.
- Respond only with valid JSON. Do not write an introduction or summary or markdown prefix like \`\`\`json\`\`\`.

## About the \`action\` field

### The common \`locate\` param

The \`locate\` param is commonly used in the \`param\` field of the action, means to locate the target element to perform the action, it conforms to the following scheme:

type LocateParam = {
      "id": string, // the id of the element found. It should either be the id marked with a rectangle in the screenshot or the id described in the description.
      "prompt"?: string // the description of the element to find. It can only be omitted when locate is null.
    } | null // If it's not on the page, the LocateParam should be null

### Supported actions

Each action has a \`type\` and corresponding \`param\`. To be detailed:
- type: 'Tap', tap the located element
  * {{ locate: {"id": string, "prompt": string} }}
- type: 'Hover', move mouse over to the located element
  * {{ locate: {"id": string, "prompt": string} }}
- type: 'Input', replace the value in the input field
  * {{ locate: {"id": string, "prompt": string}, param: {{ value: string }} }}
  * \`value\` is the final required input value based on the existing input. No matter what modifications are required, just provide the final value to replace the existing input value. 
- type: 'KeyboardPress', press a key
  * {{ param: {{ value: string }} }}
- type: 'Scroll', scroll up or down.
  * {{ 
      locate: {"id": string, "prompt": string} | null, 
      param: {{ 
        direction: 'down'(default) | 'up' | 'right' | 'left', 
        scrollType: 'once' (default) | 'untilBottom' | 'untilTop' | 'untilRight' | 'untilLeft', 
        distance: null | number 
      }} 
    }}
    * To scroll some specific element, put the element at the center of the region in the \`locate\` field. If it's a page scroll, put \`null\` in the \`locate\` field. 
    * \`param\` is required in this action. If some fields are not specified, use direction \`down\`, \`once\` scroll type, and \`null\` distance.
- type: 'ExpectedFalsyCondition'
  * use this action when the conditional statement talked about in the instruction is falsy.
`;

const outputTemplate = `
## Output JSON Format:

The JSON format is as follows:

{{
  "action": 
    {{
      "type": "Tap",
      "locate": {"id": string, "prompt": string} | null,
    }},
  ,
  "finish": boolean,
  "sleep"?: number, // The sleep time after the action, in milliseconds.
  "log": string, // Use the same language as the user's instruction.
  "error"?: string // Use the same language as the user's instruction.
}}

## Examples

### Example: Decompose a task

When the instruction is 'Click the language switch button, wait 1s, click "English"', and not log is provided

By viewing the page screenshot and description, you should consider this and output the JSON:

* The first step should be: tap the switch button, and sleep 1s after tapping.
* The language switch button is shown in the screenshot, but it's not marked with a rectangle. So we have to use the page description to find the element. By carefully checking the context information (coordinates, attributes, content, etc.), you can find the element.
* The task cannot be accomplished (this is just the first step), so \`finish\` is false.

{{
  "action":
    {{
      "type": "Tap", 
      "locate": {"id": "c81c4e9a33", "prompt": "the search bar"},
    }}
  ,
  "sleep": 1000,
  "finish": false,
  "log": "Click the language switch button and wait 1s"
}}

When you give a list of logs together with the instruction (let's say it shows the switch button has been clicked), you should consider this and output the JSON:

{{
  "action": {{
      "type": "Tap",
      "locate": ...
    }},
  "finish": true,
  "log": "Click 'English', and the instruction is finished"
}}

### Example: Some errors that can be tolerated when the user has talked about it in the instruction

If the instruction is "If there is a popup, close it", you should consider this and output the JSON:

* By viewing the page screenshot and description, you cannot find the popup, so the condition is falsy.
* Since the user has talked about this situation in the instruction, it means the user can tolerate this situation, it is not an error.

{{
  "action": {{
      "type": "ExpectedFalsyCondition",
    }},
  "finish": true,
  "log": "The popup is not on the page"
}}

For contrast, if the instruction is "Close the popup", you should consider this and output the JSON:

{{
  "action": null,
  "error": "The instruction and page context are irrelevant, there is no popup on the page",
  "finish": true,
  "log": "The popup is not on the page"
}}
`;

export async function systemPromptToTaskPlanning() {
  if (getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)) {
    return systemTemplateOfQwen;
  }

  const promptTemplate = new PromptTemplate({
    template: `${systemTemplate}\n\n${outputTemplate}`,
    inputVariables: ['pageDescription'],
  });

  return await promptTemplate.format({
    pageDescription: samplePageDescription,
  });
}

export const planSchema: ResponseFormatJSONSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'action_items',
    strict: true,
    schema: {
      type: 'object',
      strict: true,
      properties: {
        actions: {
          //  TODO
          type: 'array',
          items: {
            type: 'object',
            strict: true,
            properties: {
              thought: {
                type: 'string',
                description:
                  'Reasons for generating this task, and why this task is feasible on this page',
              },
              type: {
                type: 'string',
                description: 'Type of action, like "Tap", "Hover", etc.',
              },
              param: {
                anyOf: [
                  { type: 'null' },
                  {
                    type: 'object',
                    properties: { value: { type: ['string', 'number'] } },
                    required: ['value'],
                    additionalProperties: false,
                  },
                  {
                    type: 'object',
                    properties: { timeMs: { type: ['number', 'string'] } },
                    required: ['timeMs'],
                    additionalProperties: false,
                  },
                  {
                    type: 'object',
                    properties: {
                      direction: { type: 'string' },
                      scrollType: { type: 'string' },
                      distance: { type: ['number', 'string', 'null'] },
                    },
                    required: ['direction', 'scrollType', 'distance'],
                    additionalProperties: false,
                  },
                ],
                description:
                  'Parameter of the action, can be null ONLY when the type field is Tap or Hover',
              },
              locate: {
                type: ['object', 'null'],
                properties: {
                  ...(getAIConfigInBoolean(MATCH_BY_POSITION)
                    ? {
                        bbox: {
                          type: 'array',
                          items: { type: 'number' },
                          minItems: 4,
                          maxItems: 4,
                        },
                      }
                    : {
                        id: { type: 'string' },
                      }),
                  prompt: { type: 'string' },
                },
                required: [
                  getAIConfigInBoolean(MATCH_BY_POSITION) ? 'position' : 'id',
                  'prompt',
                ],
                additionalProperties: false,
                description: 'Location information for the target element',
              },
            },
            required: ['thought', 'type', 'param', 'locate'],
            additionalProperties: false,
          },
          description: 'List of actions to be performed',
        },
        finish: {
          type: 'boolean',
          description:
            'Whether the task will be accomplished after the actions',
        },
        furtherPlan: {
          type: ['object', 'null'],
          properties: {
            log: { type: 'string' },
            whatToDoNext: { type: 'string' },
          },
          required: ['log', 'whatToDoNext'],
          additionalProperties: false,
          description: 'Plan the task when the task cannot be accomplished',
        },
        error: {
          type: ['string', 'null'],
          description: 'Error messages about unexpected situations',
        },
      },
      required: ['actions', 'finish', 'furtherPlan', 'error'],
      additionalProperties: false,
    },
  },
};

export const generateTaskBackgroundContext = (
  userInstruction: string,
  log?: string,
) => {
  if (log) {
    return `
Here is the user's instruction:
=============
${userInstruction}
=============

This is the logs means what have been done after the previous actions. Please plan the next action based on the following logs:
=============
${log}
=============
`;
  }

  return `
Here is the user's instruction:
=============
${userInstruction}
=============
`;
};

export const automationUserPrompt = () => {
  if (getAIConfigInBoolean(MATCH_BY_POSITION)) {
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
  
      {taskBackgroundContext}
    `,
    inputVariables: ['pageDescription', 'taskBackgroundContext'],
  });
};
