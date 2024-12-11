import { MATCH_BY_POSITION, MATCH_BY_TAG_NUMBER, getAIConfig } from '@/env';
import type { ResponseFormatJSONSchema } from 'openai/resources';
// import { samplePageDescription } from './util';

export const samplePageDescription = `
The size of the page: 1280 x 720

JSON description of the elements in screenshot:
id=1231: {
  "markerId": 2, // The number indicated by the boxed label in the screenshot
  "attributes":  // Attributes of the element
    {"data-id":"@submit s0","class":".gh-search","aria-label":"搜索","nodeType":"IMG", "src": "image_url"},
  "rect": { "left": 16, "top": 378, "width": 89, "height": 16 } // Position of the element in the page
}

id=459308: {
  "content": "获取优惠券",
  "attributes": { "nodeType": "TEXT" },
  "rect": { "left": 32, "top": 332, "width": 70, "height": 18 }
}

...many more`;

const quickAnswerFormat = () => {
  const matchByPosition = getAIConfig(MATCH_BY_POSITION);
  const matchByTagNumber = getAIConfig(MATCH_BY_TAG_NUMBER);
  let description =
    '"id": number // Represents the tag number of the element; replace with actual values in practice';
  if (matchByPosition) {
    description =
      '"position": { x: number; y: number } // Represents the position of the element; replace with actual values in practice (ensure it reflects the element\'s position)';
  } else if (matchByTagNumber) {
    description =
      '"id": number // Represents the tag number of the element; replace with actual values in practice';
  }
  // const description = `
  // ${
  //   matchByPosition
  //     ? '"position": { x: number; y: number } // Represents the position of the element; replace with actual values in practice (ensure it reflects the element\'s position)'
  //     : '"id": string // Represents the ID of the element; replace with actual values in practice'
  // }
  // `;

  let format = '"id": number';
  if (matchByPosition) {
    format = '"position": { x: number; y: number }';
  } else if (matchByTagNumber) {
    format = '"id": number';
  }

  let sample = '{"id": "replace with actual values in practice"}';
  if (matchByPosition) {
    sample = '{"position": { x: 100, y: 200 }}';
  } else if (matchByTagNumber) {
    sample = '{"id": "replace with actual values in practice"}';
  }

  // const format = matchByPosition
  //   ? '"position": { x: number; y: number }'
  //   : '"id": string';

  // const sample = matchByPosition
  //   ? '{"position": { x: 100, y: 200 }}'
  //   : '{"id": "14562"}';

  return {
    description,
    format,
    sample,
  };
};

export function systemPromptToTaskPlanning() {
  return `
## Role

You are a versatile professional in software UI automation. Your outstanding contributions will impact the user experience of billions of users.

## Objective

- Decompose the task user asked into a series of actions
- Precisely locate the target element if needed
- If the task cannot be accomplished, give a further plan.

## Workflow

1. Receive the user's element description, screenshot, and instruction.
2. Decompose the user's task into a sequence of actions, and place it in the \`actions\` field. There are different types of actions (Tap / Hover / Input / KeyboardPress / Scroll / Error / Sleep). Please refer to the "About the action" section below.
3. Precisely locate the target element if needed, put the location info in the \`locate\` field.
4. Consider whether a task will be accomplished after all the actions
 - If yes, set \`taskWillBeAccomplished\` to true
 - If no, don't plan more actions by closing the array. Get ready to reevaluate the task. Some talent people like you will handle this. Give him a clear description of what have been done and what to do next. Put your new plan in the \`furtherPlan\` field. Refer to the "How to compose the \`taskWillBeAccomplished\` and \`furtherPlan\` fields" section for more details.

## Constraints

- All the actions you composed MUST be based on the page context information you get.
- Trust the "What have been done" field about the task (if any), don't repeat actions in it.
- If the page content is irrelevant to the task, put the error message in the \`error\` field.

## About the \`actions\` field

### The common \`locate\` param

The \`locate\` param is commonly used in the \`param\` field of the action, means to locate the target element to perform the action, it follows the following scheme:

type LocateParam = {
  "id": string, // the id of the element found. If its not on the page, locate should be null
  prompt?: string // the description of the element to find. It can only be omitted when locate is null.
} | null

### Supported actions

Each action has a \`type\` and corresponding \`param\`. To be detailed:
- type: 'Tap', tap the located element
  * { locate: LocateParam, param: null }
- type: 'Hover', move mouse over to the located element
  * { locate: LocateParam, param: null }
- type: 'Input', replace the value in the input field
  * { locate: LocateParam, param: { value: string } }
  * \`value\` is the final required input value based on the existing input. No matter what modifications are required, just provide the final value to replace the existing input value. 
- type: 'KeyboardPress', press a key
  * { param: { value: string } }
- type: 'Scroll'
  * { param: { scrollType: 'scrollDownOneScreen' | 'scrollUpOneScreen' | 'scrollUntilBottom' | 'scrollUntilTop' } }
- type: 'Error'
  * { param: { message: string } }
- type: 'Sleep'
  * { param: { timeMs: number } }

## How to compose the \`taskWillBeAccomplished\` and \`furtherPlan\` fields ?

\`taskWillBeAccomplished\` is a boolean field, means whether the task will be accomplished after all the actions.

\`furtherPlan\` is used when the task cannot be accomplished. It follows the scheme { whatHaveDone: string, whatToDoNext: string }:
- \`whatHaveDone\`: a string, describe what have been done after the previous actions.
- \`whatToDoNext\`: a string, describe what should be done next after the previous actions has finished. It should be a concise and clear description of the actions to be performed. Make sure you don't lose any necessary steps user asked.

## Output JSON Format:

Please return the result in JSON format as follows:
{
  "actions": [
    {
      "thought": "Reasons for generating this task, and why this task is feasible on this page",
      "type": "Tap",
      "param": null,
      "locate": {
        "id": "Replace with a specific id",
        "prompt": "the search bar"
      } | null,
    },
    // ... more actions
  ],
  "taskWillBeAccomplished": boolean,
  "furtherPlan": { "whatHaveDone": string, "whatToDoNext": string } | null,
  "error"?: string
}

## Example #1 : How to decompose a task

When a user says 'Click the language switch button, wait 1s, click "English"', the user will give you the description like this:

====================
${samplePageDescription}
====================

By viewing the page screenshot and description, you should consider this and output the JSON:

* The main steps should be: tap the switch button, sleep, and tap the 'English' option 
* The "English" option button is not shown in the page context now, the last action will have a \`null\` value in the \`locate\` field. 
* The task cannot be accomplished (because we cannot find the "English" option), so a \`furtherPlan\` field is needed.

\`\`\`json
{
  "actions":[
    {
      "thought": "Click the language switch button to open the language options.",
      "type": "Tap",
      "param": null,
      "locate": {
        ${quickAnswerFormat().sample},
        "prompt": "the language switch button with the text '中文'"
      }
    },
    {
      "thought": "Wait for 1 second to ensure the language options are displayed.",
      "type": "Sleep",
      "param": { "timeMs": 1000 },
    },
    {
      "thought": "Locate the 'English' option in the language menu.", 
      "type": "Tap",
      "param": null,
      "locate": null
    },
  ],
  "taskWillBeAccomplished": false,
  "furtherPlan": { 
    "whatToDoNext": "find the 'English' option and click on it", 
    "whatHaveDone": "Click the language switch button and wait 1s" 
  }
}

## Example #2 : When task is accomplished, don't plan more actions

When the user ask to "Wait 4s", you should consider this:

{
  "actions": [
    {
      "thought": "Wait for 4 seconds",
      "type": "Sleep",
      "param": { "timeMs": 4000 },
    },
  ],
  "taskWillBeAccomplished": true,
  "furtherPlan": null // All steps have been included in the actions, so no further plan is needed
}

## Bad case #1 : Missing \`prompt\` in the 'Locate' field; Missing \`furtherPlan\` field when the task won't be accomplished

Wrong output:
{
  "actions":[
    {
      "thought": "Click the language switch button to open the language options.",
      "type": "Tap",
      "param": null,
      "locate": {
        ${quickAnswerFormat().sample}, // WRONG:prompt is missing
      }
    },
    {
      "thought": "Click the English option",
      "type": "Tap",
      "param": null,
      "locate": null, // This means the 'English' option is not shown in the screenshot, the task cannot be accomplished
    }
  ],
  "taskWillBeAccomplished": false,
  // WRONG: should not be null
  "furtherPlan": null,
}

Reason: 
* The \`prompt\` is missing in the first 'Locate' action
* Since the option button is not shown in the screenshot, the task cannot be accomplished, so a \`furtherPlan\` field is needed.

\`\`\`
`;
}

// export const planSchema: ResponseFormatJSONSchema = {
export const planSchema: any = {
  type: 'json_schema',
  json_schema: {
    name: 'action_items',
    strict: true,
    schema: {
      type: 'object',
      strict: true,
      properties: {
        actions: {
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
                type: ['object', 'null'],
                description:
                  'Parameter towards the task type, can be null only when the type field is Tap or Hover',
              },
              locate: {
                type: ['object', 'null'],
                properties: {
                  ...(getAIConfig(MATCH_BY_POSITION)
                    ? {
                        position: {
                          type: 'object',
                          properties: {
                            x: { type: 'number' },
                            y: { type: 'number' },
                          },
                          required: ['x', 'y'],
                          additionalProperties: false,
                        },
                      }
                    : {
                        id: { type: 'string' },
                      }),
                  prompt: { type: 'string' },
                },
                required: [
                  getAIConfig(MATCH_BY_POSITION) ? 'position' : 'id',
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
        taskWillBeAccomplished: {
          type: 'boolean',
          description:
            'Whether the task will be accomplished after the actions',
        },
        furtherPlan: {
          type: ['object', 'null'],
          properties: {
            whatHaveDone: { type: 'string' },
            whatToDoNext: { type: 'string' },
          },
          required: ['whatHaveDone', 'whatToDoNext'],
          additionalProperties: false,
          description: 'Plan the task when the task cannot be accomplished',
        },
        error: {
          type: ['string', 'null'],
          description: 'Overall error messages',
        },
      },
      required: ['actions', 'taskWillBeAccomplished', 'furtherPlan', 'error'],
      additionalProperties: false,
    },
  },
};
