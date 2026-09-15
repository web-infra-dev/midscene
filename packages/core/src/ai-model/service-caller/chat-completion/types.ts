import type { StreamingCallback } from '@/types';
import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ModelRuntime } from '../../models';
import type { OpenAIRequestContext } from '../openai-request-context';

export type ChatCompletionCallOptions = {
  completion: OpenAI.Chat.Completions;
  openAIRequestContext: OpenAIRequestContext;
  modelRuntime: ModelRuntime;
  messages: ChatCompletionMessageParam[];
  requestBodyParams: Record<string, unknown>;
  requestSignal: AbortSignal;
  onChunk?: StreamingCallback;
  recordEvent?: (event: Record<string, unknown>) => void;
};

export type ChatCompletionCallResult = {
  content: string;
  reasoningContent: string;
  rawChoiceMessage?: unknown;
  rawUsage?: OpenAI.CompletionUsage;
  requestId?: string | null;
  responseModelName?: string;
};
