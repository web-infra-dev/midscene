import type { ModelRuntime } from '@/ai-model/models';
import { callAIWithObjectResponse } from '@/ai-model/service-caller';
import type { ScreenshotItem } from '@/screenshot-item';
import type {
  AIUsageInfo,
  CacheActionVerificationDataDemand,
  CacheActionVerificationStatus,
} from '@/types';
import type { ChatCompletionUserMessageParam } from 'openai/resources/index';

const CACHE_ACTION_VERIFICATION_SYSTEM_PROMPT = `You verify whether a UI action produced its expected visible effect. Follow the user's image-order and decision rules. Return only one JSON object with this exact shape: {"status":"passed|failed|uncertain","reason":"short visible evidence"}. Do not discuss unrelated UI.`;

export interface CacheActionVerificationAIResult {
  data: {
    status: CacheActionVerificationStatus;
    reason: string;
  };
  rawResponse: string;
  rawChoiceMessage?: unknown;
  reasoningContent?: string;
  usage?: AIUsageInfo;
}

export async function verifyCacheActionWithAI(options: {
  mode: 'focused-comparison' | 'full-frame';
  screenshots: ScreenshotItem[];
  dataDemand: CacheActionVerificationDataDemand;
  modelRuntime: ModelRuntime;
  abortSignal?: AbortSignal;
}): Promise<CacheActionVerificationAIResult> {
  const userContent: ChatCompletionUserMessageParam['content'] = [];

  options.screenshots.forEach((screenshot, index) => {
    if (options.mode === 'full-frame') {
      userContent.push({
        type: 'text',
        text: index === 0 ? 'Before screenshot:' : 'After screenshot:',
      });
    }
    userContent.push({
      type: 'image_url',
      image_url: {
        url: screenshot.base64,
        detail: 'high',
      },
    });
  });
  userContent.push({
    type: 'text',
    text: `Verification demand:\n${JSON.stringify(options.dataDemand)}`,
  });

  const response = await callAIWithObjectResponse<
    CacheActionVerificationAIResult['data']
  >(
    [
      {
        role: 'system',
        content: CACHE_ACTION_VERIFICATION_SYSTEM_PROMPT,
      },
      { role: 'user', content: userContent },
    ],
    options.modelRuntime,
    {
      abortSignal: options.abortSignal,
      jsonParserSource: 'generic-object',
    },
  );

  return {
    data: response.content,
    rawResponse: response.contentString,
    rawChoiceMessage: response.rawChoiceMessage,
    reasoningContent: response.reasoning_content,
    usage: response.usage,
  };
}
