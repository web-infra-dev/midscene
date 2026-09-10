import type { AIUsageInfo, StreamingCallback } from '@/types';
import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ModelRuntime } from '../models';

export type AIArgs = ChatCompletionMessageParam[];

export interface CallAIOptions {
  stream?: boolean;
  onChunk?: StreamingCallback;
  abortSignal?: AbortSignal;
  requiresOriginalImageDetail?: boolean;
  expectedJsonObjectResponse?: boolean;
  /**
   * Number of preceding semantic parsing failures for this request.
   * Network retries are intentionally excluded.
   */
  semanticRetryAttempt?: number;
}

export type AICallResult = {
  content: string;
  reasoning_content?: string;
  rawChoiceMessage?: unknown;
  usage?: AIUsageInfo;
  isStreamed: boolean;
};

export type ModelCallResult = Omit<AICallResult, 'usage'> & {
  rawUsage?: OpenAI.CompletionUsage;
  timeCost?: number;
  requestId?: string | null;
  responseModelName?: string;
};

export type ModelCallContext = {
  messages: ChatCompletionMessageParam[];
  modelRuntime: ModelRuntime;
  options?: CallAIOptions;
  executionId: string;
  recordEvent?: (event: Record<string, unknown>) => void;
};
