import { getDebug } from '@midscene/shared/logger';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ImageDetail } from '../../model-adapter/types';

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
