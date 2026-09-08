import type { AIUsageInfo } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ImageDetail } from '../../model-adapter/types';
import type { ModelRuntime } from '../../models';
import { INTERNAL_CALL_ID_FIELD } from '../utils';

export const buildUsageInfo = ({
  usageData,
  requestId,
  timeCost,
  modelName,
  modelDescription,
  responseModelName,
  slot,
  internalCallId,
}: {
  usageData?: OpenAI.CompletionUsage;
  requestId?: string | null;
  timeCost?: number;
  modelName: string;
  modelDescription: string;
  responseModelName?: string;
  slot: ModelRuntime['config']['slot'];
  internalCallId: string;
}): AIUsageInfo | undefined => {
  if (!usageData) return undefined;

  const cachedInputTokens = (
    usageData as { prompt_tokens_details?: { cached_tokens?: number } }
  )?.prompt_tokens_details?.cached_tokens;

  return {
    ...usageData,
    prompt_tokens: usageData.prompt_tokens ?? 0,
    completion_tokens: usageData.completion_tokens ?? 0,
    total_tokens: usageData.total_tokens ?? 0,
    cached_input: cachedInputTokens ?? 0,
    time_cost: timeCost ?? 0,
    model_name: modelName,
    model_description: modelDescription,
    response_model_name: responseModelName,
    slot,
    // Left undefined at the raw call layer. The agent's onUsage callback
    // fills it from modelConfig.slot for metrics collection, and task
    // layers use withUsageIntent() to stamp a more specific semantic
    // intent (e.g. 'planning', 'insight') when attaching usage to tasks.
    intent: undefined,
    request_id: requestId ?? undefined,
    // Internal stable ID for cross-path dedup when request_id is absent.
    [INTERNAL_CALL_ID_FIELD]: internalCallId,
  } satisfies AIUsageInfo;
};

export const applyImageDetail = ({
  imageDetail,
  messages,
}: {
  imageDetail?: ImageDetail;
  messages: ChatCompletionMessageParam[];
}): ChatCompletionMessageParam[] => {
  if (!imageDetail) {
    return messages;
  }

  return messages.map((msg) => {
    if (!Array.isArray(msg.content)) {
      return msg;
    }

    const content = msg.content.map((part) => {
      if (part && part.type === 'image_url' && part.image_url?.url) {
        return {
          ...part,
          image_url: {
            ...part.image_url,
            detail: imageDetail,
          },
        };
      }
      return part;
    });

    return {
      ...msg,
      content,
    } as ChatCompletionMessageParam;
  });
};

export const hasUsableText = (
  value: string | null | undefined,
): value is string => typeof value === 'string' && value.trim().length > 0;

export const resolveContentWithReasoningFallback = ({
  content,
  reasoningContent,
  useReasoningAsContentFallback,
}: {
  content: string | undefined;
  reasoningContent: string;
  useReasoningAsContentFallback: boolean;
}): string | undefined => {
  if (
    !hasUsableText(content) &&
    useReasoningAsContentFallback &&
    hasUsableText(reasoningContent)
  ) {
    const warnCall = getDebug('ai:call', { console: true });
    warnCall('empty content from AI model, using reasoning content');
    return reasoningContent;
  }

  return content;
};
