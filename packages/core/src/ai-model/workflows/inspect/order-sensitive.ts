import type { AIUsageInfo } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import {
  orderSensitiveJudgePrompt,
  systemPromptToJudgeOrderSensitive,
} from '../../prompts/order-sensitive-judge';
import type { callAIWithObjectResponse } from '../../service-caller/index';
import type { InspectAIArgs } from './helpers';

const debugInspect = getDebug('ai:inspect');

export async function AiJudgeOrderSensitive(
  description: string,
  callAIFn: typeof callAIWithObjectResponse<{ isOrderSensitive: boolean }>,
  modelConfig: IModelConfig,
): Promise<{
  isOrderSensitive: boolean;
  usage?: AIUsageInfo;
}> {
  const systemPrompt = systemPromptToJudgeOrderSensitive();
  const userPrompt = orderSensitiveJudgePrompt(description);

  const msgs: InspectAIArgs = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: userPrompt,
    },
  ];

  debugInspect(
    'AiJudgeOrderSensitive: deepThink=false, description=%s',
    description,
  );

  const result = await callAIFn(msgs, modelConfig, {
    deepThink: false,
  });

  return {
    isOrderSensitive: result.content.isOrderSensitive ?? false,
    usage: result.usage,
  };
}
