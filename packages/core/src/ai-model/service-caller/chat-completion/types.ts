import type { StreamingCallback } from '@/types';
import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ModelRuntime } from '../../models';
import type { createChatClient } from '../openai-client';

export type ChatCompletionCallOptions = {
  client: Awaited<ReturnType<typeof createChatClient>>;
  modelRuntime: ModelRuntime;
  messages: ChatCompletionMessageParam[];
  requestConfig: Record<string, unknown>;
  effectiveTimeoutMs: number | null;
  abortSignal?: AbortSignal;
  startTime: number;
  internalCallId: string;
};

export type StreamingChatCompletionCallOptions = Omit<
  ChatCompletionCallOptions,
  'internalCallId' | 'client'
> & {
  client: Omit<ChatCompletionCallOptions['client'], 'modelDescription'>;
  onChunk: StreamingCallback;
  recordEvent?: (event: Record<string, unknown>) => void;
};

export type ChatCompletionCallResult = {
  content: string;
  accumulatedReasoning: string;
  rawChoiceMessage?: unknown;
  usage?: OpenAI.CompletionUsage;
  timeCost?: number;
  requestId?: string | null;
  responseModelName?: string;
};
