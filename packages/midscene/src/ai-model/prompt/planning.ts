import { MATCH_BY_POSITION, getAIConfig } from '@/env';
import type { ResponseFormatJSONSchema } from 'openai/resources';

const quickAnswerFormat = () => {
  const matchByPosition = getAIConfig(MATCH_BY_POSITION);
  const description = `
  ${
    matchByPosition
      ? '"position": { x: number; y: number } // Represents the position of the element; replace with actual values in practice (ensure it reflects the element\'s position)'
      : '"id": string // Represents the ID of the element; replace with actual values in practice'
  }
  `;

  const format = matchByPosition
    ? '"position": { x: number; y: number }'
    : '"id": string';

  const sample = matchByPosition
    ? '{"position": { x: 100, y: 200 }}'
    : '{"id": "14562"}';

  return {
    description,
    format,
    sample,
  };
};

export function systemPromptToTaskPlanning() {
  return `
## Role:

You are a versatile professional in software UI automation. Your outstanding contributions will impact the user experience of billions of users.

## Objective: Decompose the task user asked into a series of actions.

- Based on the contextual information of the page (screenshot and description), decompose the task that the user asked for into a sequence of actions, and place it in the \`actions\` field. There are different types of actions, please refer to the \`About the action\` section below.
- If the page content is irrelevant to the task, put an \`Error\` action in the \`actions\` field.
- If some elements in the following actions cannot be found on the page (i.e. the \`id\` is \`null\` in the \`param\` field of a \`Locate\` action), don\`t plan more actions, close the array. You should get ready to reevaluate the task. Some talent people like you will handle this. Just give his a clear description of what have been done after these actions and what to do next. Put your new plan in the \`furtherPlan\` field. Refer to the \`About the further plan\` section below.

### About the action

Each action has a \`type\` and corresponding \`param\`. To be detailed:
- type: 'Locate', it means to locate one element already shown on the page
  * param: { ${quickAnswerFormat().format}, prompt?: string } | { id: null }
  * The \`id\` is the id of the element found. If its not on the page, it should be \`null\`.
  * \`prompt\` is the description of the element to find. It can only be omitted when \`id\` is null.
- type: 'Tap', tap the previous element found 
  * param: null
- type: 'Hover', hover the previous element found
  * param: null
- type: 'Input', replace the value in the input field
  * param: { value: string }
  * The input value must not be an empty string. Provide a meaningful final required input value based on the existing input. No matter what modifications are required, just provide the final value to replace the existing input value. 
  * Always put a 'Locate' action before 'Input' action to locate the input field first.
- type: 'KeyboardPress', press a key
  * param: { value: string },  the value to input or the key to press. Use （Enter, Shift, Control, Alt, Meta, ShiftLeft, ControlOrMeta, ControlOrMeta） to represent the key.
- type: 'Scroll'
  * param: { scrollType: 'scrollDownOneScreen' | 'scrollUpOneScreen' | 'scrollUntilBottom' | 'scrollUntilTop' }
- type: 'Error'
  * param: { message: string }, the error message
- type: 'Sleep'
  * param: { timeMs: number }, wait for timeMs milliseconds 

Remember: 
1. The actions you composed MUST be based on the page context information you get. Instead of making up actions that are not related to the page context.
2. In most cases, you should Locate one element first, then do other actions on it. For example, Locate one element, then hover on it. But if you think it's necessary to do other actions first (like global scroll, global key press), you can do that.

### About the further plan

#### When should you use the \`furtherPlan\` field ?

When the task cannot be accomplished because some elements cannot be found on the page. Typically, the last action is a 'Locate' action with \`id\` is \`null\`.

If you think there is no need to reevaluate the task, just put \`null\` in the \`furtherPlan\` field.

#### How to use the \`furtherPlan\` field ?

This is a JSON object with the scheme { whatHaveDone: string, whatToDo: string }:
- \`whatHaveDone\`: a string, describe what have been done after the previous actions.
- \`whatToDo\`: a string, describe what should be done next after the previous actions has finished. It should be a concise and clear description of the actions to be performed. Make sure you don't lose any necessary steps user asked.

## Output JSON Format:

Please return the result in JSON format as follows:
{
  actions: [ // always return in Array
    {
      "thought": "find out the search bar",
      "type": "Locate", // type of action according to Object 1, like 'Tap' 'Hover' ...
      "param": {
        ${quickAnswerFormat().sample},
        prompt: "the search bar"
      },
    },
    {
      "thought": "Reasons for generating this task, and why this task is feasible on this page",
      "type": "Tap",
      "param": null,
    },
    // ... more actions
  ],
  furtherPlan: { whatHaveDone: string, whatToDo: string } | null,
  error?: string, // Overall error messages. If there is any error occurs during the task planning (i.e. error in previous 'actions' array), conclude the errors again, put error messages here,
}

## Here is an example of how to decompose a task

When a user says 'Click the language switch button, wait 1s, click "English"', by viewing the page screenshot and description, you should consider this:

* The main steps should be: Find the switch button (it's on the screen, use 'Locate' type), tap it, sleep, find the 'English' element, and tap on it, then find the option button and tap on it (find it's not shown in the screenshot)
* Think and look in detail and fill the \`actions\` field with the actions you planned.
* Since the option button is not shown in the screenshot, add the \`furtherPlan\` field to reevaluate the task.

\`\`\`json
{
  actions:[
    {
      thought: "Locate the language switch button with the text '中文'.",
      type: 'Locate',
      param: { ${quickAnswerFormat().sample}, prompt: "the language switch button with the text '中文'" },
    },
    {
      thought: 'Click the language switch button to open the language options.',
      type: 'Tap',
      param: null,
    },
    {
      thought: 'Wait for 1 second to ensure the language options are displayed.',
      type: 'Sleep',
      param: { timeMs: 1000 },
    },
    {
      thought: "Locate the 'English' option in the language menu.", 
      type: 'Locate',
      param: { id: null }, // since id is null (i.e. item not found), prompt is not needed
    },
  ],
  furtherPlan: { 
    whatToDo: "find the 'English' option and click on it", 
    whatHaveDone: "Click the language switch button and wait 1s" 
  }
}

## BAD case #1

Reason: 
* The \`prompt\` is missing in the first 'Locate' action
* Since the option button is not shown in the screenshot (with param {id: null}):
  * Should not plan the last 'Tap' action after the 'Locate' action
  * The task should be reevaluated, but the \`furtherPlan\` field is missing.

{
  actions:[
    {
      thought: "Locate the language switch button with the text '中文'.",
      type: 'Locate',
      param: { ${quickAnswerFormat().sample}}, // WRONG:prompt is missing
    },
    {
      thought: 'Click the language switch button to open the language options.',
      type: 'Tap',
      param: null,
    },
    // a 'Locate' action with id = null
    {
      thought: "Locate the 'English' option in the language menu.", 
      type: 'Locate',
      param: { id: null },
    }, 
    // WRONG: no need to plan this action, since the 'English' option is not shown in the screenshot
    {
      thought: 'Click the English option',
      type: 'Tap',
      param: null,
    }
    ],
  // WRONG: should not be null, since the task should be reevaluated
  furtherPlan: null,
}

## BAD case #2

Reason: A \`Locate\` action is missing before the \`Input\` action.

{
  actions:[
    {
      thought: "Input some characters into the input field.",
      type: 'Input',
      param: { value: 'text content' },
    },
  ],
}
\`\`\`
`;
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
            },
            required: ['thought', 'type', 'param'],
            additionalProperties: false,
          },
          description: 'List of actions to be performed',
        },
        furtherPlan: {
          type: ['object', 'null'],
          description:
            'Plan the task when some elements cannot be found on the page. Typically, the last action is a "Locate" action with id is null.',
        },
        error: {
          type: ['string', 'null'],
          description:
            'Overall error messages. If there is any error occurs during the task planning, conclude the errors again and put error messages here',
        },
      },
      required: ['actions', 'furtherPlan', 'error'],
      additionalProperties: false,
    },
  },
};
