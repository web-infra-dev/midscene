import { ChatCompletionMessageParam } from 'openai/resources';
import { PlanningAction, PlanningAIResponse, UIContext } from '@/types';
import { callToGetJSONObject as callAI } from '@/ai-model/openai';
import { describeUserPage } from '@/ai-model';

const characteristic =
  'You are a versatile professional in software UI design and testing. Your outstanding contributions will impact the user experience of billions of users.';

export function systemPromptToTaskPlanning(query: string) {
  return `
  ${characteristic}
  
  Based on the page context information (screenshot and description) you get, decompose the task user asked into a series of actions.
  Actions are executed in the order listed in the list. After executing the actions, the task should be completed.

  Each action has a type and corresponding param. To be detailed:
  * type: 'Find', it means to locate one element
    * param: { prompt: string }, the prompt describes 'which element to find on page'. Our AI engine will use this prompt to locate the element, so it should clearly describe the obvious features of the element, such as its content, color, size, shape, and position. For example, 'The biggest Download Button on the left side of the page.'
  * type: 'Tap', tap the previous element found 
    * param: null
  * type: 'Hover', hover the previous element found
    * param: null
  * type: 'Input', 'KeyboardPress', input something or press a key
    * param: { value: string }, the value to input or the key to press. Use （Enter, Shift, Control, Alt, Meta, ShiftLeft, ControlOrMeta, ControlOrMeta） to represent the key.
  * type: 'Scroll'
    * param: { scrollType: 'ScrollUntilBottom', 'ScrollUntilTop', 'ScrollDown', 'ScrollUp' }
  * type: 'Error'
    * param: { message: string }, the error message
  
  Here is an example of how to decompose a task.
  When a user says 'Input "Weather in Shanghai" into the search bar, hit enter', by viewing the page screenshot and description, you my decompose this task into something like this:
  * Find: 'The search bar'
  * Input: 'Weather in Shanghai'
  * KeyboardPress: 'Enter'
  
  Remember: The actions you composed MUST be based on the page context information you get. Instead of making up actions that are not related to the page context.

  If any error occurs during the task planning (like the page content and task are irrelevant, or the element mentioned does not exist at all), please return the error message with explanation in the errors field. The thoughts、prompts、error messages should all in the same language as the user query.
  
  Return in the following JSON format:
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

  Here is the description of the task. Just go ahead:
  =====================================
  ${query}
  =====================================
  `;
}

export async function plan(context: UIContext, userPrompt: string): Promise<{ plans: PlanningAction[] }> {
  const { screenshotBase64 } = context;
  const { description } = await describeUserPage(context);
  const systemPrompt = systemPromptToTaskPlanning(userPrompt);
  const msgs: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64,
            detail: 'high',
          },
        },
        {
          type: 'text',
          text: description,
        },
      ],
    },
  ];

  const planFromAI = await callAI<PlanningAIResponse>(msgs);
  if (planFromAI.error) {
    throw new Error(planFromAI.error);
  }

  const { actions } = planFromAI;
  actions.forEach((task) => {
    if (task.type === 'Error') {
      throw new Error(task.thought);
    }
  });

  return { plans: actions };
}
