import type { ResponseFormatJSONSchema } from 'openai/resources';

export function systemPromptToTaskPlanning() {
  return `
  You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.
  
  Based on the page context information (screenshot and description) you get, decompose the task user asked into a series of actions.
  Actions are executed in the order listed in the list. After executing the actions, the task should be completed.

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
    * param: { scrollType: 'scrollDownOneScreen', 'scrollUpOneScreen', 'scrollUntilBottom', 'scrollUntilTop' }
  * type: 'Error'
    * param: { message: string }, the error message
  * type: 'Sleep'
    * param: { timeMs: number }, wait for timeMs milliseconds 
  
  Here is an example of how to decompose a task.
  When a user says 'Input "Weather in Shanghai" into the search bar, wait 1 second, hit enter', by viewing the page screenshot and description, you may decompose this task into something like this:
  * Find: 'The search bar'
  * Input: 'Weather in Shanghai'
  * Sleep: 1000
  * KeyboardPress: 'Enter'
  
  Remember: 
  1. The actions you composed MUST be based on the page context information you get. Instead of making up actions that are not related to the page context.
  2. In most cases, you should Locate one element first, then do other actions on it. For example, alway Find one element, then hover on it. But if you think it's necessary to do other actions first (like global scroll, global key press), you can do that.

  If the planned tasks are sequential and tasks may appear only after the execution of previous tasks, this is considered normal. Thoughts, prompts, and error messages should all be in the same language as the user query.

  Please return the result in JSON format as follows:
  {
    queryLanguage: '', // language of the description of the task
    actions: [ // always return in Array
      {
        "thought": "Reasons for generating this task, and why this task is feasible on this page",
        "type": "Tap", // Type of action, like 'Tap' 'Hover' ...
        "param": any, // Parameter towards the task type
      },
      // ... more actions
    ],
    error?: string, // Overall error messages. If there is any error occurs during the task planning (i.e. error in previous 'actions' array), conclude the errors again, put error messages here
  }
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
                description: 'Parameter towards the task type, can be null',
              },
            },
            required: ['thought', 'type', 'param'],
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
