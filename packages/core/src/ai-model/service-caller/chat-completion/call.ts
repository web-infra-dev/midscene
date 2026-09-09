import { getDebug } from '@midscene/shared/logger';
import type OpenAI from 'openai';
import type { ChatCompletionCallInput } from '../../model-adapter/types';
import { createChatClient } from '../openai-client';
import { formatOpenAIAPIErrorDetails } from '../openai-error';
import { resolveEffectiveTimeoutMs } from '../request-timeout';
import type { AICallResult, ModelCallContext } from '../types';
import {
  AIResponseParseError,
  buildUsageInfo,
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
  internalCallId,
  recordEvent,
}: ModelCallContext): Promise<AICallResult> => {
  const debugCall = getDebug('ai:call');
  const warnCall = getDebug('ai:call', { console: true });

  const { config: modelConfig, adapter } = modelRuntime;

  const isStreaming = options?.stream === true;

  const startTime = Date.now();

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

  const imageDetail = adapter.chatCompletion.resolveImageDetail(modelCallInput);

  const { config: adapterChatCompletionParams } =
    adapter.chatCompletion.buildChatCompletionParams(modelCallInput);

  debugCall(
    `adapter chat completion params: ${stringifyForDebug({
      config: adapterChatCompletionParams,
    })}`,
  );

  let content: string | undefined;
  let accumulatedReasoning = '';
  let rawChoiceMessage: unknown;
  let usage: OpenAI.CompletionUsage | undefined;
  let timeCost: number | undefined;
  let requestId: string | null | undefined;
  let responseModelName: string | undefined;
  const requestConfig = {
    ...adapterChatCompletionParams,
    ...(modelConfig.extraBody ?? {}),
  };

  // Some adapters request original image detail to preserve screenshot
  // resolution for localization-sensitive tasks.
  const messagesWithImageDetail = applyImageDetail({ imageDetail, messages });

  const effectiveTimeoutMs = resolveEffectiveTimeoutMs(modelConfig);

  const {
    completion,
    modelName,
    modelDescription,
    modelFamily,
    openAIErrorResponseContext,
  } = await createChatClient({
    modelConfig,
    executionId,
    recordEvent,
  });

  try {
    debugCall(
      `sending ${isStreaming ? 'streaming ' : ''}request to ${modelName}`,
    );

    if (isStreaming) {
      ({
        content,
        accumulatedReasoning,
        usage,
        timeCost,
        requestId,
        responseModelName,
      } = await callChatCompletionStream({
        client: {
          completion,
          modelName,
          modelFamily,
          openAIErrorResponseContext,
        },
        modelRuntime,
        messages: messagesWithImageDetail,
        requestConfig,
        effectiveTimeoutMs,
        abortSignal: options?.abortSignal,
        onChunk: options!.onChunk!,
        startTime,
        recordEvent,
      }));
    } else {
      ({
        content,
        accumulatedReasoning,
        rawChoiceMessage,
        usage,
        timeCost,
        requestId,
        responseModelName,
      } = await callChatCompletionNonStreaming({
        client: {
          completion,
          modelName,
          modelDescription,
          modelFamily,
          openAIErrorResponseContext,
        },
        modelRuntime,
        messages: messagesWithImageDetail,
        requestConfig,
        effectiveTimeoutMs,
        abortSignal: options?.abortSignal,
        startTime,
        internalCallId,
      }));
    }

    debugCall(`response reasoning content: ${accumulatedReasoning}`);
    debugCall(`response content: ${content}`);

    const finalUsage = buildUsageInfo({
      usageData: usage,
      requestId,
      timeCost,
      modelName,
      modelDescription,
      responseModelName,
      slot: modelConfig.slot,
      internalCallId,
    });
    // Report usage for the final result.
    if (finalUsage && modelRuntime.onUsage) {
      modelRuntime.onUsage(finalUsage);
    }

    const response = {
      content: content || '',
      reasoning_content: accumulatedReasoning || undefined,
      rawChoiceMessage,
      usage: finalUsage,
      isStreamed: !!isStreaming,
    };
    recordEvent?.({
      type: 'response',
      attempt: getLatestResponseAttempt(openAIErrorResponseContext),
      http: openAIErrorResponseContext.httpResponses?.at(-1),
      final: {
        content: response.content,
        reasoningContent: response.reasoning_content,
        usage: response.usage,
        requestId,
        timeCost,
        responseModelName,
      },
    });
    return response;
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
