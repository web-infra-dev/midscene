import { MATCH_BY_POSITION, getAIConfigInBoolean } from '@/env';
import { PromptTemplate } from '@langchain/core/prompts';
import type { ResponseFormatJSONSchema } from 'openai/resources';
import { samplePageDescription } from './util';

const locatorConfig = () => {
  const matchByPosition = getAIConfigInBoolean(MATCH_BY_POSITION);
  const locationByPosition = {
    format: '{"bbox": [number, number, number, number], "prompt": string }',
    sample: '{"bbox": [20, 50, 200, 400], "prompt": "the search bar"}',
    wrongSample: '{"bbox": [20, 50, 200, 400]}',
    locateParam: `{
      "bbox": [number, number, number, number], // the bounding box of the element found. It should either be the bounding box marked with a rectangle in the screenshot or the bounding box described in the description.
      "prompt"?: string // the description of the element to find. It can only be omitted when locate is null.
    } | null // If it's not on the page, the LocateParam should be null`,
    sampleStepOfLocating: '',
  };

  const locationById = {
    format: '{"id": string, "prompt": string}',
    sample: `{"id": "c81c4e9a33", "prompt": "the search bar"}`,
    wrongSample: '{"id": "c81c4e9a33"}',
    locateParam: `{
      "id": string, // the id of the element found. It should either be the id marked with a rectangle in the screenshot or the id described in the description.
      "prompt"?: string // the description of the element to find. It can only be omitted when locate is null.
    } | null // If it's not on the page, the LocateParam should be null`,
    sampleStepOfLocating: `* The language switch button is shown in the screenshot, but it's not marked with a rectangle. So we have to use the page description to find the element. By carefully checking the context information (coordinates, attributes, content, etc.), you can find the element.`,
  };

  return matchByPosition ? locationByPosition : locationById;
};

const systemTemplate = `
## Role

You are a versatile professional in software UI automation. Your outstanding contributions will impact the user experience of billions of users.

## Objective

- Follow the instruction user asked, and decompose it into a series of actions
- If the instruction cannot be accomplished, give a further plan.

## Workflow

1. Receive the user's element description, screenshot, and instruction.
2. Decompose the user's task into a sequence of actions, and place it in the \`actions\` field. There are different types of actions (Tap / Hover / Input / KeyboardPress / Scroll / ExpectedFalsyCondition / Sleep). The "About the action" section below will give you more details.
3. Precisely locate the target element if it's already shown in the screenshot, put the location info in the \`locate\` field of the action.
4. If the instruction can be accomplished after all the actions (no more actions needed), set \`taskWillBeAccomplished\` to true.
5. Do further planning if part of the instruction is not feasible on the current page, for example, some elements are not shown in the screenshot, or the action can only be performed after previous actions are finished. Be ready to reevaluate the task. Talented people like you will handle this. Provide him with a clear description of what has been done and what to do next. Place your new plan in the \`furtherPlan\` field. (We will soon talk about this in detail)

## Constraints

- All the actions you composed MUST be based on the page context information you get.
- Trust the "What have been done" field about the task (if any), don't repeat actions in it.
- Respond only with valid JSON. Do not write an introduction or summary or markdown prefix like \`\`\`json\`\`\`.
- If you cannot plan any actions (i.e., the actions array is empty), and this is also not expected by the user's instruction, set the reason in the \`error\` field.

## About the \`furtherPlan\` field

\`furtherPlan\` is used when further actions are needed to accomplish the task. It follows the scheme {{ whatHaveDone: string, whatToDoNext: string }}:
- \`whatHaveDone\`: a string, describe what have been done after the previous actions.
- \`whatToDoNext\`: a string, describe what should be done next after the previous actions has finished. It should be a concise and clear description of the actions to be performed. Make sure you don't lose any necessary steps user asked.

## About the \`actions\` field

### The common \`locate\` param

The \`locate\` param is commonly used in the \`param\` field of the action, means to locate the target element to perform the action, it conforms to the following scheme:

type LocateParam = {locateParam}

### Supported actions

Each action has a \`type\` and corresponding \`param\`. To be detailed:
- type: 'Tap', tap the located element
  * {{ locate: LocateParam, param: null }}
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
- type: 'ExpectedFalsyCondition'
  * {{ param: null }}
  * use this action when the conditional statement talked about in the instruction is falsy.
- type: 'Sleep'
  * {{ param: {{ timeMs: number }} }}
`;

const outputTemplate = `
## Output JSON Format:

The JSON format is as follows:

{{
  "actions": [
    {{
      "thought": "Reasons for generating this task, and why this task is feasible on this page.", // Use the same language as the user's instruction.
      "type": "Tap",
      "param": null,
      "locate": {format} | null,
    }},
    // ... more actions
  ],
  "taskWillBeAccomplished": boolean,
  "furtherPlan": {{ "whatHaveDone": string, "whatToDoNext": string }} | null, // Use the same language as the user's instruction.
  "error"?: string // Use the same language as the user's instruction.
}}

## Examples

### Example: Decompose a task

When the instruction is 'Click the language switch button, wait 1s, click "English"'

{pageDescription}

By viewing the page screenshot and description, you should consider this and output the JSON:

* The main steps should be: tap the switch button, sleep, and tap the 'English' option 
{sampleStepOfLocating}
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

### Example: Some errors that can be tolerated when the user has talked about it in the instruction

If the instruction is "If there is a popup, close it", you should consider this and output the JSON:

* By viewing the page screenshot and description, you cannot find the popup, so the condition is falsy.
* Since the user has talked about this situation in the instruction, it means the user can tolerate this situation, it is not an error.

{{
  "actions": [{{
      "type": "ExpectedFalsyCondition",
      "thought": "There is no popup on the page",
      "param": null
    }}],
  "error": null,
  "taskWillBeAccomplished": true,
  "furtherPlan": null
}}

For contrast, if the instruction is "Close the popup", you should consider this and output the JSON:

{{
  "actions": [],
  "error": "The instruction and page context are irrelevant, there is no popup on the page",
  "taskWillBeAccomplished": true,
  "furtherPlan": null
}}

### Example: What NOT to do

Wrong output:

{{
  "actions":[
    {{
      "type": "Tap",
      "thought": "Click the language switch button to open the language options.",
      "param": null,
      "locate": {wrongSample}, // WRONG: prompt is missing here
    }},
    }},
    {{
      "type": "Tap", 
      "thought": "Click the English option",
      "param": null,
      "locate": null, // This means the 'English' option is not shown in the screenshot, the task cannot be accomplished
    }}
  ],
  "taskWillBeAccomplished": false,
  "furtherPlan": null, // WRONG: since the task cannot be accomplished, the further plan should not be null
}}

`;

export async function systemPromptToTaskPlanning() {
  const promptTemplate = new PromptTemplate({
    template: `${systemTemplate}\n\n${outputTemplate}`,
    inputVariables: [
      'pageDescription',
      'sample',
      'locateParam',
      'wrongSample',
      'format',
      'sampleStepOfLocating',
    ],
  });

  return await promptTemplate.format({
    pageDescription: samplePageDescription(),
    sample: locatorConfig().sample,
    locateParam: locatorConfig().locateParam,
    wrongSample: locatorConfig().wrongSample,
    format: locatorConfig().format,
    sampleStepOfLocating: locatorConfig().sampleStepOfLocating,
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
          description: 'Error messages about unexpected situations',
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
    Here is the user's instruction:
    =====================================
    ${userPrompt}
    =====================================
    
    For your information, this is a task that some important person handed to you. Here is the original task description and what have been done after the previous actions:
    =====================================
    Original task description: ${originalPrompt}
    =====================================
    What have been done: ${whatHaveDone}
    =====================================
    `;
  }

  return `
  Here is the user's instruction:
  =====================================
  ${userPrompt}
  =====================================
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
