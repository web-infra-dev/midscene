import { getDebug } from '@midscene/shared/logger';
import type { ChatCompletionCallInput } from '../../model-adapter/types';
import { createChatClient } from '../openai-client';
import { formatOpenAIAPIErrorDetails } from '../openai-error';
import { resolveEffectiveTimeoutMs } from '../request-timeout';
import type { ModelCallContext, ModelCallResult } from '../types';
import {
  AIResponseParseError,
  getLatestResponseAttempt,
  stringifyForDebug,
} from '../utils';
import { callChatCompletionNonStreaming } from './non-stream';
import { callChatCompletionStream } from './stream';
import { applyImageDetail } from './utils';

export const chat = async ({
  messages,
  modelRuntime,
  options,
  executionId,
  recordEvent,
}: ModelCallContext): Promise<ModelCallResult> => {
  const debugCall = getDebug('ai:call');
  const warnCall = getDebug('ai:call', { console: true });

  const { config: modelConfig, adapter } = modelRuntime;

  const isStreaming = options?.stream === true;

  const modelCallInput: ChatCompletionCallInput = {
    intent: modelConfig.intent,
    userConfig: {
      temperature: modelConfig.temperature,
      reasoningEnabled: modelConfig.reasoningEnabled,
      reasoningEffort: modelConfig.reasoningEffort,
      reasoningBudget: modelConfig.reasoningBudget,
      responseFormat: modelConfig.responseFormat,
    },
    semanticRetryAttempt: options?.semanticRetryAttempt,
    requiresOriginalImageDetail: options?.requiresOriginalImageDetail,
    expectedJsonObjectResponse: options?.expectedJsonObjectResponse,
  };

  const { config: adapterChatCompletionParams } =
    adapter.chatCompletion.buildChatCompletionParams(modelCallInput);

  debugCall(
    `adapter chat completion params: ${stringifyForDebug({
      config: adapterChatCompletionParams,
    })}`,
  );

  const requestConfig = {
    ...adapterChatCompletionParams,
    ...(modelConfig.extraBody ?? {}),
  };

  const imageDetail = adapter.chatCompletion.resolveImageDetail(modelCallInput);

  // Some adapters request original image detail to preserve screenshot
  // resolution for localization-sensitive tasks.
  const messagesWithImageDetail = applyImageDetail({ imageDetail, messages });

  const effectiveTimeoutMs = resolveEffectiveTimeoutMs(modelConfig);

  const { completion, modelName, openAIErrorResponseContext } =
    await createChatClient({
      modelConfig,
      executionId,
      recordEvent,
    });

  debugCall(
    `sending ${isStreaming ? 'streaming ' : ''}request to ${modelName}`,
  );

  const callChatCompletion = isStreaming
    ? callChatCompletionStream
    : callChatCompletionNonStreaming;

  try {
    const startTime = Date.now();

    const {
      content,
      reasoningContent,
      rawChoiceMessage,
      rawUsage,
      requestId,
      responseModelName,
    } = await callChatCompletion({
      completion,
      modelName,
      openAIErrorResponseContext,
      modelRuntime,
      messages: messagesWithImageDetail,
      requestConfig,
      effectiveTimeoutMs,
      abortSignal: options?.abortSignal,
      onChunk: options?.onChunk,
      recordEvent,
    });

    const timeCost = Date.now() - startTime;
    debugCall(`response reasoning content: ${reasoningContent}`);
    debugCall(`response content: ${content}`);

    recordEvent?.({
      type: 'response',
      attempt: getLatestResponseAttempt(openAIErrorResponseContext),
      http: openAIErrorResponseContext.httpResponses?.at(-1),
      final: {
        content,
        reasoningContent,
        usage: rawUsage,
        requestId,
        timeCost,
        responseModelName,
      },
    });

    return {
      content,
      reasoning_content: reasoningContent,
      rawChoiceMessage,
      rawUsage,
      isStreamed: isStreaming,
      timeCost,
      requestId,
      responseModelName,
    };
  } catch (e: any) {
    warnCall('call AI error', e);

    if (e instanceof AIResponseParseError) {
      throw e;
    }

    const newError = new Error(
      `failed to call ${isStreaming ? 'streaming ' : ''}AI model service (${modelName}): ${e.message}${formatOpenAIAPIErrorDetails(e, openAIErrorResponseContext)}\nTrouble shooting: https://midscenejs.com/model-provider.html`,
      {
        cause: e,
      },
    );
    throw newError;
  }
};
