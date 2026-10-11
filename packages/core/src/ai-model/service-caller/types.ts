import type { RawAssistantOutput } from '@/types';
import type { AIUsageInfo, StreamingCallback } from '@/types';
import type OpenAI from 'openai';
import type { ImageDetail } from '../model-adapter/types';
import type { ModelRuntime } from '../models';
import type { OpenAIRequestContext } from './openai/openai-request-context';

export type MessageTextContent = { type: 'text'; text: string };

export type MessageContent =
  | MessageTextContent
  | { type: 'image'; url: string; detail?: ImageDetail };

export type ConversationUserMessage = {
  role: 'user';
  content: string | MessageContent[];
};

export type ConversationSystemMessage = {
  role: 'system';
  content: string | MessageTextContent[];
};

export type ConversationAssistantMessage = {
  role: 'assistant';
  content: string | MessageTextContent[];
};

export type ConversationMessage =
  | ConversationUserMessage
  | ConversationSystemMessage
  | ConversationAssistantMessage;

export type ConversationEntry =
  | { type: 'input-message'; message: ConversationMessage }
  | { type: 'model-output'; output: RawAssistantOutput };

// Callers can construct ordinary messages directly or include history entries.
export type ModelCallMessages = (ConversationMessage | ConversationEntry)[];

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
  rawAssistantOutput?: RawAssistantOutput;
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
  requestSignal: AbortSignal;
  effectiveTimeoutMs: number | null;
  messages: ModelCallMessages;
  modelRuntime: ModelRuntime;
  options?: CallAIOptions;
  executionId: string;
  recordEvent?: (event: Record<string, unknown>) => void;
};

/** Context shared by one HTTP protocol request. */
export type OpenAIProtocolCallOptions = {
  requestSignal: AbortSignal;
  openAIRequestContext: OpenAIRequestContext;
  onChunk?: StreamingCallback;
  recordEvent?: (event: Record<string, unknown>) => void;
};

/** Normalized protocol response, before Midscene timing and usage metadata. */
export type OpenAIProtocolCallResult = {
  content: string;
  reasoningContent: string;
  rawAssistantOutput?: RawAssistantOutput;
  rawUsage?: OpenAI.CompletionUsage;
  requestId?: string | null;
  responseModelName?: string;
};
