import { getDebug } from '@midscene/shared/logger';
import { hasUsableText } from '../utils';

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
