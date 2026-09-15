import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ModelRuntime } from '../../../models';
import type { OpenAIProtocolCallOptions } from '../../types';

export type ChatCompletionCallOptions = OpenAIProtocolCallOptions & {
  completion: OpenAI.Chat.Completions;
  modelRuntime: ModelRuntime;
  messages: ChatCompletionMessageParam[];
  requestBodyParams: Record<string, unknown>;
};
