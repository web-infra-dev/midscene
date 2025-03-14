import {
  MATCH_BY_POSITION,
  MIDSCENE_USE_QWEN_VL,
  getAIConfigInBoolean,
} from '@/env';
import { PromptTemplate } from '@langchain/core/prompts';
import type { ResponseFormatJSONSchema } from 'openai/resources';
import { samplePageDescription } from './util';

// Note: put the log field first to trigger the CoT
const qwenCoTLog = `"what_the_user_wants_to_do_next_by_instruction": string, // What the user wants to do according to the instruction and previous logs. `;
const qwenCurrentLog = `"log": string, // Log what the next one action (ONLY ONE!) you can do according to the screenshot and the instruction. The typical log looks like "I will use action {{ action-type }} to do ..". If no action should be done, log the reason. ". Use the same language as the user's instruction.`;
const llmCurrentLog = `"log": string, // Log what the next actions you can do according to the screenshot and the instruction. The typical log looks like "I will use action {{ action-type }} to do ..". If no action should be done, log the reason. ". Use the same language as the user's instruction.`;

const commonOutputFields = `"error"?: string, // Error messages about unexpected situations, if any. Only think it is an error when the situation is not expected according to the instruction. Use the same language as the user's instruction.
  "more_actions_needed_by_instruction": boolean, // Consider if there is still more action(s) to do after the action in "Log" is done, according to the instruction. If so, set this field to true. Otherwise, set it to false.`;

const qwenLocateParam =
  'locate: {bbox_2d: [number, number, number, number], prompt: string }';

const systemTemplateOfQwen = `
Target: User will give you a screenshot, an instruction and some previous logs indicating what have been done. Please tell what the next one action is (or null if no action should be done) to do the tasks the instruction requires. 

Restriction:
- Don't give extra actions or plans beyond the instruction. ONLY plan for what the instruction requires. For example, don't try to submit the form if the instruction is only to fill something.
- Always give ONLY ONE action in \`log\` field (or null if no action should be done), instead of multiple actions. Supported actions are Tap, Hover, Input, KeyboardPress, Scroll.
- Don't repeat actions in the previous logs.

Supporting actions:
- Tap: { type: "Tap", ${qwenLocateParam} }
- Hover: { type: "Hover", ${qwenLocateParam} }
- Input: { type: "Input", ${qwenLocateParam}, param: { value: string } } // \`value\` is the final that should be filled in the input box. No matter what modifications are required, just provide the final value to replace the existing input value. 
- KeyboardPress: { type: "KeyboardPress", param: { value: string } }
- Scroll: { type: "Scroll", ${qwenLocateParam} | null, param: { direction: 'down'(default) | 'up' | 'right' | 'left', scrollType: 'once' (default) | 'untilBottom' | 'untilTop' | 'untilRight' | 'untilLeft', distance: null | number }} // locate is the element to scroll. If it's a page scroll, put \`null\` in the \`locate\` field.

Field description:
* The \`prompt\` field inside the \`locate\` field is a short description that could be used to locate the element.

Return in JSON format:
{
  ${qwenCoTLog}
  ${qwenCurrentLog}
  ${commonOutputFields}
  "action": 
    {
      // one of the supporting actions
    } | null,
  ,
  "sleep"?: number, // The sleep time after the action, in milliseconds.
}
`;

const llmLocateParam = `locate: {{"id": string, "prompt": string}} | null`;
const systemTemplateOfLLM = `
## Role

You are a versatile professional in software UI automation. Your outstanding contributions will impact the user experience of billions of users.

## Objective

- Decompose the instruction user asked into a series of actions
- Locate the target element if possible
- If the instruction cannot be accomplished, give a further plan.

## Workflow

1. Receive the screenshot, element description of screenshot(if any), user's instruction and previous logs.
2. Decompose the user's task into a sequence of actions, and place it in the \`actions\` field. There are different types of actions (Tap / Hover / Input / KeyboardPress / Scroll / FalsyConditionStatement / Sleep). The "About the action" section below will give you more details.
3. Precisely locate the target element if it's already shown in the screenshot, put the location info in the \`locate\` field of the action.
4. If some target elements is not shown in the screenshot, consider the user's instruction is not feasible on this page. Follow the next steps.
5. Consider whether the user's instruction will be accomplished after all the actions
 - If yes, set \`taskWillBeAccomplished\` to true
 - If no, don't plan more actions by closing the array. Get ready to reevaluate the task. Some talent people like you will handle this. Give him a clear description of what have been done and what to do next. Put your new plan in the \`furtherPlan\` field. The "How to compose the \`taskWillBeAccomplished\` and \`furtherPlan\` fields" section will give you more details.

## Constraints

- All the actions you composed MUST be based on the page context information you get.
- Trust the "What have been done" field about the task (if any), don't repeat actions in it.
- Respond only with valid JSON. Do not write an introduction or summary or markdown prefix like \`\`\`json\`\`\`.
- If the screenshot and the instruction are totally irrelevant, set reason in the \`error\` field.

## About the \`actions\` field

The \`locate\` param is commonly used in the \`param\` field of the action, means to locate the target element to perform the action, it conforms to the following scheme:

type LocateParam = {{
  "id": string, // the id of the element found. It should either be the id marked with a rectangle in the screenshot or the id described in the description.
  "prompt"?: string // the description of the element to find. It can only be omitted when locate is null.
}} | null // If it's not on the page, the LocateParam should be null

## Supported actions

Each action has a \`type\` and corresponding \`param\`. To be detailed:
- type: 'Tap'
  * {{ ${llmLocateParam} }}
- type: 'Hover'
  * {{ ${llmLocateParam} }}
- type: 'Input', replace the value in the input field
  * {{ ${llmLocateParam}, param: {{ value: string }} }}
  * \`value\` is the final value that should be filled in the input field. No matter what modifications are required, just provide the final value user should see after the action is done. 
- type: 'KeyboardPress', press a key
  * {{ param: {{ value: string }} }}
- type: 'Scroll', scroll up or down.
  * {{ 
      ${llmLocateParam}, 
      param: {{ 
        direction: 'down'(default) | 'up' | 'right' | 'left', 
        scrollType: 'once' (default) | 'untilBottom' | 'untilTop' | 'untilRight' | 'untilLeft', 
        distance: null | number 
      }} 
    }}
    * To scroll some specific element, put the element at the center of the region in the \`locate\` field. If it's a page scroll, put \`null\` in the \`locate\` field. 
    * \`param\` is required in this action. If some fields are not specified, use direction \`down\`, \`once\` scroll type, and \`null\` distance.
- type: 'ExpectedFalsyCondition'
  * {{ param: {{ reason: string }} }}
  * use this action when the conditional statement talked about in the instruction is falsy.
- type: 'Sleep'
  * {{ param: {{ timeMs: number }} }}
`;

const outputTemplate = `
## Output JSON Format:

The JSON format is as follows:

{{
  "actions": [
    // ... some actions
  ],
  ${llmCurrentLog}
  ${commonOutputFields}
}}

## Examples

### Example: Decompose a task

When the instruction is 'Click the language switch button, wait 1s, click "English"', and not log is provided

By viewing the page screenshot and description, you should consider this and output the JSON:

* The main steps should be: tap the switch button, sleep, and tap the 'English' option
* The language switch button is shown in the screenshot, but it's not marked with a rectangle. So we have to use the page description to find the element. By carefully checking the context information (coordinates, attributes, content, etc.), you can find the element.
* The "English" option button is not shown in the screenshot now, it means it may only show after the previous actions are finished. So don't plan any action to do this.
* Log what these action do: Click the language switch button to open the language options. Wait for 1 second.
* The task cannot be accomplished (because we cannot see the "English" option now), so the \`more_actions_needed_by_instruction\` field is true.

{{
  "actions":[
    {{
      "type": "Tap", 
      "thought": "Click the language switch button to open the language options.",
      "param": null,
      "locate": {{ id: "c81c4e9a33", prompt: "The language switch button" }},
    }},
    {{
      "type": "Sleep",
      "thought": "Wait for 1 second to ensure the language options are displayed.",
      "param": {{ "timeMs": 1000 }},
    }}
  ],
  "error": null,
  "more_actions_needed_by_instruction": true,
  "log": "Click the language switch button to open the language options. Wait for 1 second",
}}

### Example: What NOT to do
Wrong output:
{{
  "actions":[
    {{
      "type": "Tap",
      "thought": "Click the language switch button to open the language options.",
      "param": null,
      "locate": {{
        {{ "id": "c81c4e9a33" }}, // WRONG: prompt is missing
      }}
    }},
    {{
      "type": "Tap", 
      "thought": "Click the English option",
      "param": null,
      "locate": null, // This means the 'English' option is not shown in the screenshot, the task cannot be accomplished
    }}
  ],
  "more_actions_needed_by_instruction": false, // WRONG: should be true
  "log": "Click the language switch button to open the language options",
}}

Reason:
* The \`prompt\` is missing in the first 'Locate' action
* Since the option button is not shown in the screenshot, there are still more actions to be done, so the \`more_actions_needed_by_instruction\` field should be true
`;

export async function systemPromptToTaskPlanning() {
  if (getAIConfigInBoolean(MIDSCENE_USE_QWEN_VL)) {
    return systemTemplateOfQwen;
  }

  const promptTemplate = new PromptTemplate({
    template: `${systemTemplateOfLLM}\n\n${outputTemplate}`,
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
                description:
                  'Type of action, one of "Tap", "Hover" , "Input", "KeyboardPress", "Scroll", "ExpectedFalsyCondition", "Sleep"',
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
                  {
                    type: 'object',
                    properties: { reason: { type: 'string' } },
                    required: ['reason'],
                    additionalProperties: false,
                  },
                ],
                description:
                  'Parameter of the action, can be null ONLY when the type field is Tap or Hover',
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
) => {
  if (log) {
    return `
Here is the user's instruction:
<instruction>
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
${userInstruction}
</instruction>
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
