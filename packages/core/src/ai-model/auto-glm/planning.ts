import type { PlanningAIResponse, UIContext } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ConversationHistory } from '../conversation-history';
import { callAIWithStringResponse } from '../service-caller/index';
import { transformAutoGLMAction } from './actions';
import { parseAction, parseAutoGLMResponse } from './parser';
import { getAutoGLMPlanPrompt } from './prompt';

const debug = getDebug('auto-glm-planning');

export async function autoGLMPlanning(
  userInstruction: string,
  options: {
    conversationHistory: ConversationHistory;
    context: UIContext;
    modelConfig: IModelConfig;
    actionContext?: string;
  },
): Promise<PlanningAIResponse> {
  const { conversationHistory, context, modelConfig, actionContext } = options;

  const systemPrompt =
    getAutoGLMPlanPrompt(modelConfig.vlMode) +
    (actionContext
      ? `<high_priority_knowledge>${actionContext}</high_priority_knowledge>`
      : '');

  const imagePayload = context.screenshotBase64;

  conversationHistory.append({
    role: 'user',
    content: [{ type: 'text', text: userInstruction }],
  });
  conversationHistory.append({
    role: 'user',
    content: [{ type: 'image_url', image_url: { url: imagePayload } }],
  });

  const msgs: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.snapshot(1),
  ];

  const { content: rawResponse, usage } = await callAIWithStringResponse(
    msgs,
    modelConfig,
  );

  debug('autoGLMPlanning rawResponse:', rawResponse);

  const parsedResponse = parseAutoGLMResponse(rawResponse);
  debug('thinking in response:', parsedResponse.think);
  debug('action in response:', parsedResponse.content);

  let transformedActions = [] as ReturnType<typeof transformAutoGLMAction>;

  const parsedAction = parseAction(parsedResponse);
  debug('Parsed action object:', parsedAction);
  transformedActions = transformAutoGLMAction(parsedAction, context.size);
  debug('Transformed actions:', transformedActions);

  conversationHistory.append({
    role: 'assistant',
    content: `<think>${parsedResponse.think}</think><answer>${parsedResponse.content}</answer>`,
  });

  const shouldContinue = !parsedResponse.content.startsWith('finish(');

  return {
    actions: transformedActions,
    log: rawResponse,
    usage,
    more_actions_needed_by_instruction: shouldContinue,
    rawResponse: JSON.stringify(rawResponse, undefined, 2),
  };
}
