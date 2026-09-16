import type OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import type { ExtractContentAndReasoning } from '../../../model-adapter/types';
import type { OpenAIProtocolCallOptions } from '../../types';

export type ChatCompletionCallOptions = OpenAIProtocolCallOptions & {
  completion: OpenAI.Chat.Completions;
  extractContentAndReasoning: ExtractContentAndReasoning;
  useReasoningAsContentFallback: boolean;
  requestBodyParams: Omit<ChatCompletionCreateParamsNonStreaming, 'stream'>;
};
