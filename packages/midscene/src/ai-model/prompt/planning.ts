import {
  MATCH_BY_POSITION,
  MATCH_BY_TAG_NUMBER,
  getAIConfig,
  matchByElementId,
  matchByPosition,
  matchByTagNumber,
} from '@/env';
import type { ResponseFormatJSONSchema } from 'openai/resources';

const promptForMatchByElementId = `
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
  "id": string // Represents the element ID from the JSON description list,
  prompt?: string // the description of the element to find. It can only be omitted when locate is null
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
        "id": string,
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

...many more
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
        "id": "1231",
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
        "id": "1231", // WRONG:prompt is missing
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
`;

const promptForMatchByPosition = `
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
  "position": { x: number; y: number } // Represents the position of the element in the screenshot,
  prompt?: string // the description of the element to find. It can only be omitted when locate is null
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
        "position": { x: number, y: number },
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

When a user says 'Click the language switch button, wait 1s, click "English"', you should consider this and output the JSON:

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
        "position": { "x": 100, "y": 200 },
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
        "position": { "x": 100, "y": 200 }, // WRONG:prompt is missing
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
`;

// const promptForMatchByTagNumber = `
// ## Role:

// You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.

// ## Objective 1 (main objective): Decompose the task user asked into a series of actions:

// - Based on the page context information (screenshot and description) you get, decompose the task user asked into a series of actions.
// - Actions are executed in the order listed in the list. After executing the actions, the task should be completed.
// - Note that single and double quotation marks are not allowed in the json format(important)

// Each action has a type and corresponding param. To be detailed:
// * type: 'Locate', it means to locate one element
//   * param: { prompt: string }, the prompt describes 'which element to focus on page'. Our AI engine will use this prompt to locate the element, so it should clearly describe the obvious features of the element, such as its content, color, size, shape, and position. For example, 'The biggest Download Button on the left side of the page.'
// * type: 'Tap', tap the previous element found
//   * param: null
// * type: 'Hover', hover the previous element found
//   * param: null
// * type: 'Input', replace the value in the input field
//   * param: { value: string }, The input value must not be an empty string. Provide a meaningful final required input value based on the existing input. No matter what modifications are required, just provide the final value to replace the existing input value. After locating the input field, do not use 'Tap' action, proceed directly to 'Input' action.
// * type: 'KeyboardPress',  press a key
//   * param: { value: string },  the value to input or the key to press. Use （Enter, Shift, Control, Alt, Meta, ShiftLeft, ControlOrMeta, ControlOrMeta） to represent the key.
// * type: 'Scroll'
//   * param: { "scrollType": "scrollDownOneScreen" | "scrollUpOneScreen" | "scrollUntilBottom" | "scrollUntilTop" }
// * type: 'Error'
//   * param: { message: string }, the error message
// * type: 'Sleep'
//   * param: { timeMs: number }, wait for timeMs milliseconds

// Remember:
// 1. The actions you composed MUST be based on the page context information you get. Instead of making up actions that are not related to the page context.
// 2. In most cases, you should Locate one element first, then do other actions on it. For example, Locate one element, then hover on it. But if you think it's necessary to do other actions first (like global scroll, global key press), you can do that.
// 3. If the planned actions are sequential and some actions may appear only after the execution of previous actions, this is considered normal. Thoughts, prompts, and error messages should all be in the same language as the user's description.

// ## Output JSON Format:

// Pay special attention to the use of single and double quotes to avoid json formatting errors

// Do not use "wrap" in json string content, resulting in json parse

// Please return the result in JSON format as follows:
// {
//   "queryLanguage": "", // language of the description of the task
//   "actions": [ // always return in Array
//     {
//       "thought": "find out the search bar",
//       "type": "Locate", // type of action according to Object 1, like 'tap' 'hover' ...
//       "param": { //
//         "prompt": "The search bar"
//       }
//     },
//     {
//       "thought": "Reasons for generating this task, and why this task is feasible on this page",
//       "type": "Tap",
//       "param": null
//     },
//     // ... more actions
//   ],
//   "error"?: string // Overall error messages. If there is any error occurs during the task planning (i.e. error in previous 'actions' array), conclude the errors again, put error messages here,
// }

// ## Here is an example of how to decompose a task

// When a user says 'Click the language switch button, wait 1s, click "English"', by viewing the page screenshot and description, you should consider this:

// * The main steps are: Find the switch button, tap it, sleep, find the 'English' element, and tap on it.
// * Think and look in detail and fill all the fields in the JSON format.

// \`\`\`json
// {
//   "queryLanguage": "English",
//   "actions":[
//     {
//       "thought": "Locate the language switch button with the text 中文.",
//       "type": "Locate",
//       "param": { "prompt": "The language switch button with the text 中文" }
//     },
//     {
//       "thought": "Click the language switch button to open the language options.",
//       "type": "Tap",
//       "param": null
//     },
//     {
//       "thought": "Wait for 1 second to ensure the language options are displayed.",
//       "type": "Sleep",
//       "param": { "timeMs": 1000 }
//     },
//     {
//       "thought": "Locate the 'English' option in the language menu.",
//       "type": "Locate",
//       "param": { prompt: "The 'English' option in the language menu" }
//     },
//     {
//       "thought": "Click the 'English' option to switch the language.",
//       "type": "Tap",
//       "param": null
//     },
//     {
//       "thought": "scroll down one screen to view more options.",
//       "type": "Scroll",
//       "param": { "scrollType": "scrollDownOneScreen" }
//     }
//   ]
// }
// \`\`\`
// `;

const promptForMatchByTagNumber = `
## 角色

你是一位软件UI自动化领域的专业人士。你的杰出贡献将影响数十亿用户的使用体验。

## 目标

- 将用户要求的任务分解为一系列操作
- 在需要时精确定位目标元素

## 工作流程

1. 接收用户的截图和指令
2. 将用户的任务分解为一系列操作,并放在\`actions\`字段中。只能使用以下操作类型:Tap / Hover / Input / KeyboardPress / Scroll / Error / Sleep。请参考下面的"关于操作"部分。
3. 在需要时精确定位目标元素,将定位信息放在\`locate\`字段中。

## 约束条件

- 你组织的所有操作必须基于你获得的页面上下文信息
- 相信"已完成的工作"字段中的任务内容(如果有),不要重复其中的操作
- 如果页面内容与任务无关,将错误信息放在\`error\`字段中
- 在locate.prompt中保持元素描述简洁精确,只包含识别目标元素的必要信息
- 严格限制操作类型为:Tap / Hover / Input / KeyboardPress / Scroll / Error / Sleep,不允许使用其他类型

## 关于\`actions\`字段

### 通用的\`locate\`参数

\`locate\`参数通常用在操作的\`param\`字段中,用于定位要执行操作的目标元素,它遵循以下方案:

### 支持的操作

仅支持以下操作类型,不允许使用其他类型:

- type: 'Tap', 点击定位的元素
  * { locate: {
    prompt: string // 目标元素的精确描述,包括关键识别特征如文本内容、视觉外观或相对位置。例如:"右下角的蓝色'提交'按钮","带有'输入关键词'占位符的搜索输入框"
  }, param: null }
- type: 'Hover', 将鼠标移到定位的元素上
  * { locate: {
    prompt: string // 目标元素的精确描述,包括关键识别特征如文本内容、视觉外观或相对位置。例如:"右下角的蓝色'提交'按钮","带有'输入关键词'占位符的搜索输入框"
  }, param: null }
- type: 'Input', 替换输入框中的值
  * { locate: {
    prompt: string // 目标元素的精确描述,包括关键识别特征如文本内容、视觉外观或相对位置。例如:"右下角的蓝色'提交'按钮","带有'输入关键词'占位符的搜索输入框"
  }, param: { value: string } }
  * \`value\`是基于现有输入的最终所需输入值。无论需要什么修改,只需提供用于替换现有输入值的最终值。
- type: 'KeyboardPress', 按下一个键
  * { param: { value: string } }
- type: 'Scroll'
  * { param: { scrollType: 'scrollDownOneScreen' | 'scrollUpOneScreen' | 'scrollUntilBottom' | 'scrollUntilTop' } }
- type: 'Error'
  * { param: { message: string } }
- type: 'Sleep'
  * { param: { timeMs: number } }

## 输出JSON格式:

请按以下格式返回结果:
{
  "actions": [
    {
      "thought": string,
      "type": string,
      "param": object | null,
      "locate": {
        "prompt": string
      } | null
    }
  ],
  "error"?: string
}

## 示例 #1 : 如何分解任务

当用户说"点击语言切换按钮,等待1秒,点击'English'"时,你应该考虑这点并输出JSON:

{
  "actions":[
    {
      "thought": "点击语言切换按钮以打开语言选项。",
      "type": "Tap",
      "param": null,
      "locate": {
        "prompt": "显示'中文'文本的语言切换按钮"
      }
    },
    {
      "thought": "等待1秒确保语言选项显示出来。",
      "type": "Sleep",
      "param": { "timeMs": 1000 }
    },
    {
      "thought": "定位语言菜单中的'English'选项。",
      "type": "Tap",
      "param": null,
      "locate": {
        "prompt": "语言菜单中的'English'选项"
      }
    }
  ]
}

## 示例 #2 : 简单任务

当用户要求"等待4秒"时,你应该输出:

{
  "actions": [
    {
      "thought": "等待4秒",
      "type": "Sleep",
      "param": { "timeMs": 4000 }
    }
  ]
}

## 错误案例 #1 : locate.prompt中的元素描述模糊

错误输出:
{
  "actions":[
    {
      "thought": "点击语言切换按钮以打开语言选项。",
      "type": "Tap",
      "param": null,
      "locate": {
        "prompt": "按钮"
      }
    },
    {
      "thought": "点击English选项",
      "type": "Tap",
      "param": null,
      "locate": {
        "prompt": "English"
      }
    }
  ]
}

原因:
* \`prompt\`太模糊,应该包含关键识别特征如文本内容、视觉外观或位置

## 错误案例 #2: 使用了不支持的操作类型

错误输出:
{
  "actions":[
    {
      "thought": "双击登录按钮",
      "type": "DoubleClick",
      "param": null,
      "locate": {
        "prompt": "蓝色的登录按钮"
      }
    },
    {
      "thought": "选择'下单'选项",
      "type": "SelectOption",
      "param": null,
      "locate": {
        "prompt": "'下单'选项"
      }
    },
    {
      "thought": "拖拽滑块到最右边",
      "type": "DragAndDrop",
      "param": {
        "from": { "x": 0, "y": 0 },
        "to": { "x": 100, "y": 0 }
      },
      "locate": {
        "prompt": "验证滑块"
      }
    }
  ]
}

原因:
* 使用了不支持的\`SelectOption\`和\`DragAndDrop\`操作类型
* 应该使用支持的操作类型列表中的操作,比如用\`Tap\`替代\`DoubleClick\`、\`Tap\`替代\`SelectOption\`
`;

export function systemPromptToTaskPlanning() {
  if (matchByPosition) {
    return promptForMatchByPosition;
  }
  if (matchByTagNumber) {
    return promptForMatchByTagNumber;
  }
  return promptForMatchByElementId;
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
                    : getAIConfig(MATCH_BY_TAG_NUMBER)
                      ? {
                          number: { type: 'number' },
                        }
                      : {
                          id: { type: 'string' },
                        }),
                  prompt: { type: 'string' },
                },
                required: [
                  getAIConfig(MATCH_BY_POSITION)
                    ? 'position'
                    : getAIConfig(MATCH_BY_TAG_NUMBER)
                      ? 'number'
                      : 'id',
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
