import type { AIUsageInfo } from '@/types';
import { assert } from '@midscene/shared/utils';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { ModelRuntime } from '../models';
import { type JsonParserSource, assertJsonObject } from '../shared/json';
import { callAI } from './call';
import {
  callAiAndParseWithRetry,
  withSemanticRetryFeedback,
} from './semantic-retry';
import type { CallAIOptions } from './types';
import type { AIArgs } from './types';
import { AIResponseParseError } from './utils';

export type AIObjectResponse<T> = {
  // TODO: `content` is a misleading name here because this is already the parsed object response. Consider renaming it to `object` or `data`.
  content: T;
  contentString: string;
  usage?: AIUsageInfo;
  reasoning_content?: string;
  rawChoiceMessage?: unknown;
};

export function parseAIObjectResponse<T>(
  response: Awaited<ReturnType<typeof callAI>>,
  modelRuntime: ModelRuntime,
  jsonParserSource: JsonParserSource = 'generic-object',
): AIObjectResponse<T> {
  const { adapter } = modelRuntime;
  assert(response, 'empty response');
  const jsonContent = adapter.jsonParser(response.content, {
    source: jsonParserSource,
  });
  assertJsonObject(jsonContent);
  return {
    content: jsonContent as T,
    contentString: response.content,
    usage: response.usage,
    reasoning_content: response.reasoning_content,
    rawChoiceMessage: response.rawChoiceMessage,
  };
}

export async function callAIWithObjectResponse<T>(
  messages: ChatCompletionMessageParam[],
  modelRuntime: ModelRuntime,
  options?: {
    abortSignal?: AbortSignal;
    jsonParserSource?: JsonParserSource;
    retryTimes?: number;
    retryInterval?: number;
  },
): Promise<AIObjectResponse<T>> {
  const { config: modelConfig } = modelRuntime;
  return callAiAndParseWithRetry({
    callAi: (retryAttempt, previousParseError) =>
      callAI(
        withSemanticRetryFeedback(messages, previousParseError),
        modelRuntime,
        {
          abortSignal: options?.abortSignal,
          expectedJsonObjectResponse: true,
          semanticRetryAttempt: retryAttempt,
        },
      ),
    parseResponse: (response) =>
      parseAIObjectResponse<T>(
        response,
        modelRuntime,
        options?.jsonParserSource,
      ),
    toParseError: (error, response) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return new AIResponseParseError(
        errorMessage,
        response.content,
        response.usage,
        response.rawChoiceMessage,
        response.reasoning_content,
      );
    },
    parseRetryTimes: options?.retryTimes ?? modelConfig.retryCount,
    parseRetryInterval: options?.retryInterval ?? modelConfig.retryInterval,
    abortSignal: options?.abortSignal,
  });
}

export async function callAIWithStringResponse(
  msgs: AIArgs,
  modelRuntime: ModelRuntime,
  options?: Pick<CallAIOptions, 'abortSignal' | 'requiresOriginalImageDetail'>,
): Promise<{
  content: string;
  usage?: AIUsageInfo;
  rawChoiceMessage?: unknown;
}> {
  const { content, usage, rawChoiceMessage } = await callAI(
    msgs,
    modelRuntime,
    options,
  );
  return { content, usage, rawChoiceMessage };
}
