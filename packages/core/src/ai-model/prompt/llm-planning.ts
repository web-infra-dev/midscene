import type { PageType } from '@/types';
import { PromptTemplate } from '@langchain/core/prompts';
import type { vlLocateMode } from '@midscene/shared/env';
import type { ResponseFormatJSONSchema } from 'openai/resources';
import { bboxDescription } from './common';
import { samplePageDescription } from './util';
// Note: put the log field first to trigger the CoT
const vlCoTLog = `"what_the_user_wants_to_do_next_by_instruction": string, // What the user wants to do according to the instruction and previous logs. `;
const vlCurrentLog = `"log": string, // Log what the next one action (ONLY ONE!) you can do according to the screenshot and the instruction. The typical log looks like "Now i want to use action '{{ action-type }}' to do .. first". If no action should be done, log the reason. ". Use the same language as the user's instruction.`;
const llmCurrentLog = `"log": string, // Log what the next actions you can do according to the screenshot and the instruction. The typical log looks like "Now i want to use action '{{ action-type }}' to do ..". If no action should be done, log the reason. ". Use the same language as the user's instruction.`;

const commonOutputFields = `"error"?: string, // Error messages about unexpected situations, if any. Only think it is an error when the situation is not expected according to the instruction. Use the same language as the user's instruction.
  "more_actions_needed_by_instruction": boolean, // Consider if there is still more action(s) to do after the action in "Log" is done, according to the instruction. If so, set this field to true. Otherwise, set it to false.`;
const vlLocateParam =
  'locate: {bbox: [number, number, number, number], prompt: string }';

const systemTemplateOfVLPlanning = ({
  pageType,
  vlMode,
}: {
  pageType: PageType;
  vlMode: ReturnType<typeof vlLocateMode>;
}) => `
Target: User will give you a screenshot, an instruction and some previous logs indicating what have been done. Please tell what the next one action is (or null if no action should be done) to do the tasks the instruction requires. 

Restriction:
- Don't give extra actions or plans beyond the instruction. ONLY plan for what the instruction requires. For example, don't try to submit the form if the instruction is only to fill something.
- Always give ONLY ONE action in \`log\` field (or null if no action should be done), instead of multiple actions. Supported actions are Tap, Hover, Input, KeyboardPress, Scroll${pageType === 'android' ? ', AndroidBackButton, AndroidHomeButton, AndroidRecentAppsButton, AndroidLongPress, AndroidPull.' : '.'}
- Don't repeat actions in the previous logs.
- Bbox is the bounding box of the element to be located. It's an array of 4 numbers, representing ${bboxDescription(vlMode)}.

Supporting actions:
- Tap: { type: "Tap", ${vlLocateParam} }
- RightClick: { type: "RightClick", ${vlLocateParam} }
- Hover: { type: "Hover", ${vlLocateParam} }
- Input: { type: "Input", ${vlLocateParam}, param: { value: string } } // Replace the input field with a new value. \`value\` is the final that should be filled in the input box. No matter what modifications are required, just provide the final value to replace the existing input value. Giving a blank string means clear the input field.
- KeyboardPress: { type: "KeyboardPress", param: { value: string } }
- Scroll: { type: "Scroll", ${vlLocateParam} | null, param: { direction: 'down'(default) | 'up' | 'right' | 'left', scrollType: 'once' (default) | 'untilBottom' | 'untilTop' | 'untilRight' | 'untilLeft', distance: null | number }} // locate is the element to scroll. If it's a page scroll, put \`null\` in the \`locate\` field.
${
  pageType === 'android'
    ? `- AndroidBackButton: { type: "AndroidBackButton", param: {} }
- AndroidHomeButton: { type: "AndroidHomeButton", param: {} }
- AndroidRecentAppsButton: { type: "AndroidRecentAppsButton", param: {} }
- AndroidLongPress: { type: "AndroidLongPress", param: { x: number, y: number, duration?: number } }
- AndroidPull: { type: "AndroidPull", param: { direction: 'up' | 'down', startPoint?: { x: number, y: number }, distance?: number, duration?: number } } // Pull down to refresh (direction: 'down') or pull up to load more (direction: 'up')`
    : ''
}

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
    "locate": {
      "bbox": [100, 100, 200, 200],
      "prompt": "The 'Yes' button in popup"
    }
  }
}
`;

const llmLocateParam = `locate: {{"id": string, "prompt": string}} | null`;
const systemTemplateOfLLM = ({ pageType }: { pageType: PageType }) => `
## Role

You are a versatile professional in software UI automation. Your outstanding contributions will impact the user experience of billions of users.

## Objective

- Decompose the instruction user asked into a series of actions
- Locate the target element if possible
- If the instruction cannot be accomplished, give a further plan.

## Workflow

1. Receive the screenshot, element description of screenshot(if any), user's instruction and previous logs.
2. Decompose the user's task into a sequence of actions, and place it in the \`actions\` field. There are different types of actions (Tap / Hover / Input / KeyboardPress / Scroll / FalsyConditionStatement / Sleep ${pageType === 'android' ? '/ AndroidBackButton / AndroidHomeButton / AndroidRecentAppsButton / AndroidLongPress / AndroidPull' : ''}). The "About the action" section below will give you more details.
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
- type: 'RightClick'
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
  * {{ param: {{ button: 'Back' | 'Home' | 'RecentApp' }} }}
- type: 'ExpectedFalsyCondition'
  * {{ param: {{ reason: string }} }}
  * use this action when the conditional statement talked about in the instruction is falsy.
- type: 'Sleep'
  * {{ param: {{ timeMs: number }} }}
${
  pageType === 'android'
    ? `- type: 'AndroidBackButton', trigger the system "back" operation on Android devices
  * {{ param: {{}} }}
- type: 'AndroidHomeButton', trigger the system "home" operation on Android devices
  * {{ param: {{}} }}
- type: 'AndroidRecentAppsButton', trigger the system "recent apps" operation on Android devices
  * {{ param: {{}} }}
- type: 'AndroidLongPress', trigger a long press on the screen at specified coordinates on Android devices
  * {{ param: {{ x: number, y: number, duration?: number }} }}
- type: 'AndroidPull', trigger pull down to refresh or pull up actions on Android devices
  * {{ param: {{ direction: 'up' | 'down', startPoint?: {{ x: number, y: number }}, distance?: number, duration?: number }} }}`
    : ''
}
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

export async function systemPromptToTaskPlanning({
  pageType,
  vlMode,
}: {
  pageType: PageType;
  vlMode: ReturnType<typeof vlLocateMode>;
}) {
  if (vlMode) {
    return systemTemplateOfVLPlanning({ pageType, vlMode });
  }

  const promptTemplate = new PromptTemplate({
    template: `${systemTemplateOfLLM({ pageType })}\n\n${outputTemplate}`,
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
                  'Type of action, one of "Tap", "RightClick", "Hover" , "Input", "KeyboardPress", "Scroll", "ExpectedFalsyCondition", "Sleep", "AndroidBackButton", "AndroidHomeButton", "AndroidRecentAppsButton", "AndroidLongPress"',
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
                  {
                    type: 'object',
                    properties: { button: { type: 'string' } },
                    required: ['button'],
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

export const automationUserPrompt = (
  vlMode: ReturnType<typeof vlLocateMode>,
) => {
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
