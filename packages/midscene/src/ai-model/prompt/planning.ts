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
    : '{"id": "wefew2222few2"}';

  return {
    description,
    format,
    sample,
  };
};

export function systemPromptToTaskPlanning() {
  return `
## Role:

You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.

## Objective 1 (main objective): Decompose the task user asked into a series of actions:

- Based on the page context information (screenshot and description) you get, decompose the task user asked into a series of actions.
- Actions are executed in the order listed in the list. After executing the actions, the task should be completed.

Each action has a type and corresponding param. To be detailed:
* type: 'Locate', it means to locate one element
  * param: { prompt: string }, the prompt describes 'which element to focus on page'. Our AI engine will use this prompt to locate the element, so it should clearly describe the obvious features of the element, such as its content, color, size, shape, and position. For example, 'The biggest Download Button on the left side of the page.'
* type: 'Tap', tap the previous element found 
  * param: null
* type: 'Hover', hover the previous element found
  * param: null
* type: 'Input', replace the value in the input field
  * param: { value: string }, The input value must not be an empty string. Provide a meaningful final required input value based on the existing input. No matter what modifications are required, just provide the final value to replace the existing input value. After locating the input field, do not use 'Tap' action, proceed directly to 'Input' action.
* type: 'KeyboardPress',  press a key
  * param: { value: string },  the value to input or the key to press. Use （Enter, Shift, Control, Alt, Meta, ShiftLeft, ControlOrMeta, ControlOrMeta） to represent the key.
* type: 'Scroll'
  * param: { scrollType: 'scrollDownOneScreen' | 'scrollUpOneScreen' | 'scrollUntilBottom' | 'scrollUntilTop' }
* type: 'Error'
  * param: { message: string }, the error message
* type: 'Sleep'
  * param: { timeMs: number }, wait for timeMs milliseconds 

Remember: 
1. The actions you composed MUST be based on the page context information you get. Instead of making up actions that are not related to the page context.
2. In most cases, you should Locate one element first, then do other actions on it. For example, Locate one element, then hover on it. But if you think it's necessary to do other actions first (like global scroll, global key press), you can do that.
3. If the planned actions are sequential and some actions may appear only after the execution of previous actions, this is considered normal. Thoughts, prompts, and error messages should all be in the same language as the user's description.

## Objective 2 (sub objective, only for action with type "Locate"): Give a quick answer to the action with type "Locate" you just planned, append a \`quickAnswer\` field as a sibling of the \`param\` field

If the action type is 'Locate', think about this: does any element on screen meet the description in the prompt? If so, answer with the following format, as the \`quickAnswer\` field in the output JSON:
{
  "reason": "It is located (somewhere), is an (node type). According to the screenshot, it is a shopping cart icon button (or it's text is 'Shopping Cart')",
  "text": "PLACEHOLDER", // Replace PLACEHOLDER with the text of elementInfo, if none, leave empty
  ${quickAnswerFormat().description}
}

If there is no element meets the description in the prompt (usually because it will show up later after some interaction), the \`quickAnswer\` field should be null.

## Output JSON Format:

Please return the result in JSON format as follows:
{
  queryLanguage: '', // language of the description of the task
  actions: [ // always return in Array
    {
      "thought": "find out the search bar",
      "type": "Locate", // type of action according to Object 1, like 'Tap' 'Hover' ...
      "param": { //
        "prompt": "The search bar"
      },
      "quickAnswer": {
        "reason": "This is ...",
        "text": string, // Replace PLACEHOLDER with the text of elementInfo, if none, leave empty
        ${quickAnswerFormat().format}
      } | null,
    },
    {
      "thought": "Reasons for generating this task, and why this task is feasible on this page",
      "type": "Tap",
      "param": null,
    },
    // ... more actions
  ],
  error?: string, // Overall error messages. If there is any error occurs during the task planning (i.e. error in previous 'actions' array), conclude the errors again, put error messages here,
}

## Here is an example of how to decompose a task

When a user says 'Click the language switch button, wait 1s, click "English"', by viewing the page screenshot and description, you should consider this:

* The main steps are: Find the switch button, tap it, sleep, find the 'English' element, and tap on it.
* Think and look in detail and fill all the fields in the JSON format.

\`\`\`json
{
  queryLanguage: 'English', 
  actions:[
    {
      thought: "Locate the language switch button with the text '中文'.",
      type: 'Locate',
      param: { prompt: "The language switch button with the text '中文'" },
      quickAnswer: { // according to Objective 2,  this action type is 'Locate', and we can find the element, so we need to give a quick answer
        reason: "It is located  near the top center, is an text node. According to the screenshot, it is a language switch button with the text '中文'.",
        text: '中文',
        ${quickAnswerFormat().sample}
      },
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
      param: { prompt: "The 'English' option in the language menu" },
      quickAnswer: null, // we cannot find this item in the description (it will show only after the previous interactions), so the quick answer is null here
    },
    {
      thought: "Click the 'English' option to switch the language.",
      type: 'Tap',
      param: null,
    }
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
      properties: {
        queryLanguage: {
          type: 'string',
          description: 'Language of the description of the task',
        },
        actions: {
          type: 'array',
          items: {
            type: 'object',
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
              quickAnswer: {
                type: ['object', 'null'],
                nullable: true,
                properties: {
                  reason: {
                    type: 'string',
                    description: 'Reason for finding this element',
                  },
                  text: {
                    type: 'string',
                    description: 'Text of elementInfo, if none, leave empty',
                  },
                  id: {
                    type: 'string',
                    description: 'ID of this element',
                  },
                },
                required: ['reason', 'text', 'id'],
                additionalProperties: false,
              },
            },
            required: ['thought', 'type', 'param', 'quickAnswer'],
            additionalProperties: false,
          },
          description: 'List of actions to be performed',
        },
        error: {
          type: ['string', 'null'],
          description:
            'Overall error messages. If there is any error occurs during the task planning, conclude the errors again and put error messages here',
        },
      },
      required: ['queryLanguage', 'actions', 'error'],
      additionalProperties: false,
    },
  },
};
