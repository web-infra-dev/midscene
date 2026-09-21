import type { AIUsageInfo } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import type {
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/index';
import type { ModelRuntime } from '../../models';
import {
  orderSensitiveJudgePrompt,
  systemPromptToJudgeOrderSensitive,
} from '../../prompt/order-sensitive-judge';
import { callAIWithObjectResponse } from '../../service-caller/index';

type InsightAIArgs = [
  ChatCompletionSystemMessageParam,
  ...ChatCompletionUserMessageParam[],
];

const debugInsight = getDebug('ai:insight');

export async function AiJudgeOrderSensitive(
  description: string,
  modelRuntime: ModelRuntime,
): Promise<{
  isOrderSensitive: boolean;
  usage?: AIUsageInfo;
}> {
  const systemPrompt = systemPromptToJudgeOrderSensitive();
  const userPrompt = orderSensitiveJudgePrompt(description);

  const msgs: InsightAIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: userPrompt,
    },
  ];

  debugInsight('AiJudgeOrderSensitive: description=%s', description);

  const result = await callAIWithObjectResponse<{ isOrderSensitive: boolean }>(
    msgs,
    modelRuntime,
    {
      jsonParserSource: 'generic-object',
    },
  );

  return {
    isOrderSensitive: result.content.isOrderSensitive ?? false,
    usage: result.usage,
  };
}
