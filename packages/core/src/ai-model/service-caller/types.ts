import type { AIUsageInfo, StreamingCallback } from '@/types';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ChatCompletionCallInput } from '../model-adapter/types';
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

export type ModelCallContext = {
  messages: ChatCompletionMessageParam[];
  modelRuntime: ModelRuntime;
  modelCallInput: ChatCompletionCallInput;
  options?: CallAIOptions;
  executionId: string;
  internalCallId: string;
  recordEvent?: (event: Record<string, unknown>) => void;
};
