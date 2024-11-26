import type { ResponseFormatJSONSchema } from 'openai/resources';
import { MATCH_BY_POSITION, getAIConfig } from '../openai';

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
- If some elements cannot be found on the page, plan to reevaluate the task. Some talent people like you will handle this. Just give his a clear description of what have been done after these actions and what to do next. Put your plan in the \`furtherPlan\` field. Refer to the \`About the further plan\` section below.

### About the action

Each action has a \`type\` and corresponding \`param\`. To be detailed:
- type: 'Locate', it means to locate one element already shown on the page
  * param: { ${quickAnswerFormat().format} }
  * The \`id\` is the id of the element found (NOT the \`markerId\`).
- type: 'Tap', tap the previous element found 
  * param: null
- type: 'Hover', hover the previous element found
  * param: null
- type: 'Input', replace the value in the input field
  * param: { value: string }, The input value must not be an empty string. Provide a meaningful final required input value based on the existing input. No matter what modifications are required, just provide the final value to replace the existing input value. After locating the input field, do not use 'Tap' action, proceed directly to 'Input' action.
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
- \`whatHaveDone\`: a string, describe what have been done after the previous actions
- \`whatToDo\`: a string, describe what should be done next after the previous actions has finished

## Output JSON Format:

Please return the result in JSON format as follows:
{
  actions: [ // always return in Array
    {
      "thought": "find out the search bar",
      "type": "Locate", // type of action according to Object 1, like 'Tap' 'Hover' ...
      "param": {
        ${quickAnswerFormat().sample}
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
      param: { ${quickAnswerFormat().sample} },
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
      param: { id: null },
    },
  ],
  furtherPlan: { 
    whatToDo: "find the 'English' option and click on it", 
    whatHaveDone: "Click the language switch button and wait 1s" 
  }
}

## Here is a BAD example of how to decompose a task

Reason: The option button is not shown in the screenshot (id: null), so the task should be reevaluated, but the \`furtherPlan\` field is missing.

{
  actions:[
    {
      thought: "Locate the language switch button with the text '中文'.",
      type: 'Locate',
      param: { ${quickAnswerFormat().sample} },
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
    // there should be a 'Plan' action with params here to reevaluate the task
  ],
  furtherPlan: null,
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
