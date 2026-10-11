import { getDebug } from '@midscene/shared/logger';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ResolveImageDetail } from '../../../model-adapter/types';
import type { ModelCallMessages } from '../../types';
import { hasUsableText } from '../../utils';

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

/** Chat Completions cannot replay Responses output items as messages. */
export function toChatMessages(
  messages: ModelCallMessages,
  resolveImageDetail: ResolveImageDetail,
): ChatCompletionMessageParam[] {
  // The installed SDK does not yet include the supported `original` image detail.
  return messages.map((entry) => {
    if ('type' in entry && entry.type === 'model-output') {
      if (entry.output.type !== 'chat-completion') {
        throw new Error(
          'Cannot replay Responses output in a Chat Completions conversation',
        );
      }
      return entry.output.rawValue;
    }
    const message = 'role' in entry ? entry : entry.message;
    return {
      role: message.role,
      content:
        typeof message.content === 'string'
          ? message.content
          : message.content.map((part) => {
              if (part.type === 'text') {
                return { type: 'text', text: part.text };
              }
              return {
                type: 'image_url',
                image_url: {
                  url: part.url,
                  detail: resolveImageDetail({ imageDetail: part.detail }),
                },
              };
            }),
    };
  }) as ChatCompletionMessageParam[];
}
