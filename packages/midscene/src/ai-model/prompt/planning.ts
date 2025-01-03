import { MATCH_BY_POSITION, getAIConfig } from '@/env';
import { PromptTemplate } from '@langchain/core/prompts';
import type { ResponseFormatJSONSchema } from 'openai/resources';
import { samplePageDescription } from './util';

const quickAnswerFormat = () => {
  const matchByPosition = getAIConfig(MATCH_BY_POSITION);

  const locationFormat = {
    position: {
      description:
        '"position": { x: number; y: number } // Represents the position of the element; replace with actual values in practice (ensure it reflects the element\'s position)',
      format: '"position": { x: number; y: number }',
      sample:
        '{"prompt": "the search bar" // Use language consistent with the information on the page}',
      locateParam: `{
        "prompt"?: string // the description of the element to find. It can only be omitted when locate is null.
      } | null // If it's not on the page, the LocateParam should be null`,
    },
    id: {
      description:
        '"id": string // Represents the ID of the element; replace with actual values in practice',
      format: '"id": string',
      sample: `{"id": "c81c4e9a33", "prompt": "the search bar"}`,
      locateParam: `{
        "id": string, // the id of the element found. It should either be the id marked with a rectangle in the screenshot or the id described in the description.
        "prompt"?: string // the description of the element to find. It can only be omitted when locate is null.
      } | null // If it's not on the page, the LocateParam should be null`,
    },
  };

  const type = matchByPosition ? 'position' : 'id';
  const format = locationFormat[type];

  return {
    description: format.description,
    format: format.format,
    sample: format.sample,
    locateParam: format.locateParam,
  };
};

const systemTemplate = `
## Role

You are a versatile professional in software UI automation. Your outstanding contributions will impact the user experience of billions of users.

## Objective

- Decompose the instruction user asked into a series of actions
- Locate the target element if possible
- If the instruction cannot be accomplished, give a further plan.

## Workflow

1. Receive the user's element description, screenshot, and instruction.
2. Decompose the user's task into a sequence of actions, and place it in the \`actions\` field. There are different types of actions (Tap / Hover / Input / KeyboardPress / Scroll / FalsyConditionStatement / Sleep). The "About the action" section below will give you more details.
3. Precisely locate the target element if it's already shown in the screenshot, put the location info in the \`locate\` field of the action.
4. If some target elements is not shown in the screenshot, consider the user's instruction is not feasible on this page. Follow the next steps.
5. Consider whether the user's instruction will be accomplished after all the actions
 - If yes, set \`taskWillBeAccomplished\` to true
 - If no, don't plan more actions by closing the array. Get ready to reevaluate the task. Some talent people like you will handle this. Give him a clear description of what have been done and what to do next. Put your new plan in the \`furtherPlan\` field. The "How to compose the \`taskWillBeAccomplished\` and \`furtherPlan\` fields" section will give you more details.

## Constraints

- All the actions you composed MUST be based on the page context information you get.
- Trust the "What have been done" field about the task (if any), don't repeat actions in it.
- Respond only with valid JSON. Do not write an introduction or summary or markdown prefix like \`\`\`json\`.
- If you cannot plan any action at all (i.e. empty actions array), set reason in the \`error\` field.

## About the \`actions\` field

### The common \`locate\` param

The \`locate\` param is commonly used in the \`param\` field of the action, means to locate the target element to perform the action, it follows the following scheme:

type LocateParam = {locateParam}

### Supported actions

Each action has a \`type\` and corresponding \`param\`. To be detailed:
- type: 'Tap', tap the located element
  * {{ locate: {sample}, param: null }}
- type: 'Hover', move mouse over to the located element
  * {{ locate: LocateParam, param: null }}
- type: 'Input', replace the value in the input field
  * {{ locate: LocateParam, param: {{ value: string }} }}
  * \`value\` is the final required input value based on the existing input. No matter what modifications are required, just provide the final value to replace the existing input value. 
- type: 'KeyboardPress', press a key
  * {{ param: {{ value: string }} }}
- type: 'Scroll', scroll up or down.
  * {{ 
      locate: LocateParam | null, 
      param: {{ 
        direction: 'down'(default) | 'up' | 'right' | 'left', 
        scrollType: 'once' (default) | 'untilBottom' | 'untilTop' | 'untilRight' | 'untilLeft', 
        distance: null | number 
      }} 
    }}
    * To scroll some specific element, put the element at the center of the region in the \`locate\` field. If it's a page scroll, put \`null\` in the \`locate\` field. 
    * \`param\` is required in this action. If some fields are not specified, use direction \`down\`, \`once\` scroll type, and \`null\` distance.
- type: 'FalsyConditionStatement'
  * {{ param: null }}
  * use this action when the instruction is an "if" statement and the condition is falsy.
- type: 'Sleep'
  * {{ param: {{ timeMs: number }} }}

## How to compose the \`taskWillBeAccomplished\` and \`furtherPlan\` fields ?

\`taskWillBeAccomplished\` is a boolean field, means whether the task will be accomplished after all the actions.

\`furtherPlan\` is used when the task cannot be accomplished. It follows the scheme {{ whatHaveDone: string, whatToDoNext: string }}:
- \`whatHaveDone\`: a string, describe what have been done after the previous actions.
- \`whatToDoNext\`: a string, describe what should be done next after the previous actions has finished. It should be a concise and clear description of the actions to be performed. Make sure you don't lose any necessary steps user asked.
`;

const outputTemplate = `
## Output JSON Format:

The JSON format is as follows:

{{
  "actions": [
    {{
      "thought": "Reasons for generating this task, and why this task is feasible on this page",
      "type": "Tap",
      "param": null,
      "locate": {sample} | null,
    }},
    // ... more actions
  ],
  "taskWillBeAccomplished": boolean,
  "furtherPlan": {{ "whatHaveDone": string, "whatToDoNext": string }} | null,
  "error"?: string
}}
Here is an example of how to decompose a task:

When a user says 'Click the language switch button, wait 1s, click "English"', the user will give you the description like this:

====================
{pageDescription}
====================

By viewing the page screenshot and description, you should consider this and output the JSON:

* The main steps should be: tap the switch button, sleep, and tap the 'English' option 
* The language switch button is shown in the screenshot, but it's not marked with a rectangle. So we have to use the page description to find the element. By carefully checking the context information (coordinates, attributes, content, etc.), you can find the element.
* The "English" option button is not shown in the screenshot now, it means it may only show after the previous actions are finished. So the last action will have a \`null\` value in the \`locate\` field. 
* The task cannot be accomplished (because we cannot see the "English" option now), so a \`furtherPlan\` field is needed.

{{
  "actions":[
    {{
      "type": "Tap", 
      "thought": "Click the language switch button to open the language options.",
      "param": null,
      "locate": {sample},
    }},
    {{
      "type": "Sleep",
      "thought": "Wait for 1 second to ensure the language options are displayed.",
      "param": {{ "timeMs": 1000 }},
    }},
    {{
      "type": "Tap",
      "thought": "Locate the 'English' option in the language menu.",
      "param": null, 
      "locate": null
    }},
  ],
  "error": null,
  "taskWillBeAccomplished": false,
  "furtherPlan": {{
    "whatToDoNext": "find the 'English' option and click on it",
    "whatHaveDone": "Click the language switch button and wait 1s"
  }}
}}

Here is another example of how to tolerate error situations only when the instruction is an "if" statement:

If the user says "If there is a popup, close it", you should consider this and output the JSON:

* By viewing the page screenshot and description, you cannot find the popup, so the condition is falsy.
* The instruction itself is an "if" statement, it means the user can tolerate this situation, so you should leave a \`FalsyConditionStatement\` action.

{{
  "actions": [{{
      "type": "FalsyConditionStatement",
      "thought": "There is no popup on the page",
      "param": null
    }}
  ],
  "taskWillBeAccomplished": true,
  "furtherPlan": null
}}

For contrast, if the user says "Close the popup" in this situation, you should consider this and output the JSON:

{{
  "actions": [],
  "error": "The instruction and page context are irrelevant, there is no popup on the page",
  "taskWillBeAccomplished": true,
  "furtherPlan": null
}}

Here is an example of when task is accomplished, don't plan more actions:

When the user ask to "Wait 4s", you should consider this:

{{
  "actions": [
    {{
      "type": "Sleep",
      "thought": "Wait for 4 seconds",
      "param": {{ "timeMs": 4000 }},
    }},
  ],
  "taskWillBeAccomplished": true,
  "furtherPlan": null // All steps have been included in the actions, so no further plan is needed
}}

Here is an example of what NOT to do:

Wrong output:

{{
  "actions":[
    {{
      "type": "Tap",
      "thought": "Click the language switch button to open the language options.",
      "param": null,
      "locate": {{
        {sample}, // WRONG:prompt is missing
      }}
    }},
    {{
      "type": "Tap", 
      "thought": "Click the English option",
      "param": null,
      "locate": null, // This means the 'English' option is not shown in the screenshot, the task cannot be accomplished
    }}
  ],
  "taskWillBeAccomplished": false,
  // WRONG: should not be null
  "furtherPlan": null,
}}

Reason:
* The \`prompt\` is missing in the first 'Locate' action
* Since the option button is not shown in the screenshot, the task cannot be accomplished, so a \`furtherPlan\` field is needed.
`;

export async function systemPromptToTaskPlanning() {
  const promptTemplate = new PromptTemplate({
    template: `${systemTemplate}\n\n${outputTemplate}`,
    inputVariables: ['pageDescription', 'sample', 'locateParam'],
  });

  return await promptTemplate.format({
    pageDescription: samplePageDescription,
    sample: quickAnswerFormat().sample,
    locateParam: quickAnswerFormat().locateParam,
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
                  'Parameter of the action, can be null ONLY when the type field is Tap or Hover',
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

export const generateTaskBackgroundContext = (
  userPrompt: string,
  originalPrompt?: string,
  whatHaveDone?: string,
) => {
  if (originalPrompt && whatHaveDone) {
    return `
    For your information, this is a task that some important person handed to you. Here is the original task description and what have been done after the previous actions:
    =====================================
    Original task description: ${originalPrompt}
    =====================================
    What have been done: ${whatHaveDone}
    =====================================
    `;
  }

  return `
  Here is the instruction:
  =====================================
  ${userPrompt}
  =====================================
  `;
};

export const automationUserPrompt = new PromptTemplate({
  template: `
    pageDescription:
    =====================================
    {pageDescription}
    =====================================

    {taskBackgroundContext}
  `,
  inputVariables: ['pageDescription', 'taskBackgroundContext'],
});
