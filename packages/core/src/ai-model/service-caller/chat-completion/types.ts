import type { StreamingCallback } from '@/types';
import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ModelRuntime } from '../../models';
import type { OpenAIErrorResponseContext } from '../openai-error';

export type ChatCompletionCallOptions = {
  completion: OpenAI.Chat.Completions;
  modelName: string;
  openAIErrorResponseContext: OpenAIErrorResponseContext;
  modelRuntime: ModelRuntime;
  messages: ChatCompletionMessageParam[];
  requestConfig: Record<string, unknown>;
  effectiveTimeoutMs: number | null;
  abortSignal?: AbortSignal;
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
