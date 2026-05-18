import type { AIUsageInfo, DeepThinkOption } from '@/types';
import type { CodeGenerationChunk, StreamingCallback } from '@/types';
import {
  type IModelConfig,
  MIDSCENE_MODEL_MAX_TOKENS,
  OPENAI_MAX_TOKENS,
  globalConfigManager,
} from '@midscene/shared/env';

import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { Stream } from 'openai/streaming';
import { getModelAdapter } from '../models';
import type { AIArgs } from '../types';
import { createChatClient } from './client';
import {
  callAIWithCodexAppServer,
  isCodexAppServerProvider,
} from './codex-app-server';
import { AIResponseParseError } from './error';
import { resolveReasoningConfig } from './reasoning';
import {
  buildRequestAbortSignal,
  isHardTimeoutError,
  resolveEffectiveTimeoutMs,
} from './request-timeout';

export { AIResponseParseError } from './error';
export { resolveReasoningConfig } from './reasoning';

function hasExplicitReasoningConfig({
  reasoningEnabled,
  reasoningEffort,
  reasoningBudget,
}: {
  reasoningEnabled?: boolean;
  reasoningEffort?: string;
  reasoningBudget?: number;
}): boolean {
  return (
    reasoningEnabled !== undefined ||
    !!reasoningEffort ||
    reasoningBudget !== undefined
  );
}

export async function callAI(
  messages: ChatCompletionMessageParam[],
  modelConfig: IModelConfig,
  options?: {
    stream?: boolean;
    onChunk?: StreamingCallback;
    deepThink?: DeepThinkOption;
    abortSignal?: AbortSignal;
  },
): Promise<{
  content: string;
  reasoning_content?: string;
  usage?: AIUsageInfo;
  isStreamed: boolean;
}> {
  const mergedEnableReasoning = (() => {
    const normalizedDeepThink =
      options?.deepThink === 'unset' ? undefined : options?.deepThink;
    if (normalizedDeepThink === true) return true;
    if (normalizedDeepThink === false) return false;
    return modelConfig.reasoningEnabled;
  })();

  if (isCodexAppServerProvider(modelConfig.openaiBaseURL)) {
    if (
      !modelConfig.modelFamily &&
      hasExplicitReasoningConfig({
        reasoningEnabled: modelConfig.reasoningEnabled,
        reasoningEffort: modelConfig.reasoningEffort,
        reasoningBudget: modelConfig.reasoningBudget,
      })
    ) {
      throw new Error(
        'Reasoning config requires MIDSCENE_MODEL_FAMILY. Set MIDSCENE_MODEL_FAMILY when using MIDSCENE_MODEL_REASONING_ENABLED / MIDSCENE_MODEL_REASONING_EFFORT / MIDSCENE_MODEL_REASONING_BUDGET.',
      );
    }

    return callAIWithCodexAppServer(messages, modelConfig, {
      stream: options?.stream,
      onChunk: options?.onChunk,
      reasoningEnabled: mergedEnableReasoning,
      abortSignal: options?.abortSignal,
    });
  }

  const { completion, modelName, modelDescription, modelFamily } =
    await createChatClient({
      modelConfig,
    });
  const adapter = getModelAdapter(modelFamily);
  const effectiveTimeoutMs = resolveEffectiveTimeoutMs(modelConfig);

  const extraBody = modelConfig.extraBody;

  const maxTokens =
    globalConfigManager.getEnvConfigValueAsNumber(MIDSCENE_MODEL_MAX_TOKENS) ??
    globalConfigManager.getEnvConfigValueAsNumber(OPENAI_MAX_TOKENS);
  const debugCall = getDebug('ai:call');
  const warnCall = getDebug('ai:call', { console: true });
  const debugProfileStats = getDebug('ai:profile:stats');
  const debugProfileDetail = getDebug('ai:profile:detail');

  const startTime = Date.now();

  const isStreaming = options?.stream && options?.onChunk;
  const {
    config: adapterChatCompletionParams,
    lockedParams: adapterLockedParams,
  } = adapter.chatCompletion.buildChatCompletionParams({
    intent: modelConfig.intent,
    temperature: modelConfig.temperature ?? 0,
  });
  const lockedParamSet = new Set(adapterLockedParams ?? []);
  const ignoredLockedParams = new Set<string>();
  const filterLockedParams = <T extends Record<string, unknown>>(
    params: T,
  ): T => {
    const filtered = Object.fromEntries(
      Object.entries(params).filter(([key, value]) => {
        if (lockedParamSet.has(key) && value !== undefined) {
          ignoredLockedParams.add(key);
          return false;
        }
        return true;
      }),
    ) as T;
    return filtered;
  };
  let content: string | undefined;
  let accumulated = '';
  let accumulatedReasoning = '';
  let usage: OpenAI.CompletionUsage | undefined;
  let timeCost: number | undefined;
  let requestId: string | null | undefined;

  const hasUsableText = (value: string | null | undefined): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  const buildUsageInfo = (
    usageData?: OpenAI.CompletionUsage,
    requestId?: string | null,
  ) => {
    if (!usageData) return undefined;

    const cachedInputTokens = (
      usageData as { prompt_tokens_details?: { cached_tokens?: number } }
    )?.prompt_tokens_details?.cached_tokens;

    return {
      prompt_tokens: usageData.prompt_tokens ?? 0,
      completion_tokens: usageData.completion_tokens ?? 0,
      total_tokens: usageData.total_tokens ?? 0,
      cached_input: cachedInputTokens ?? 0,
      time_cost: timeCost ?? 0,
      model_name: modelName,
      model_description: modelDescription,
      slot: modelConfig.slot,
      intent: modelConfig.intent,
      request_id: requestId ?? undefined,
    } satisfies AIUsageInfo;
  };

  const envCommonConfig = filterLockedParams({
    stream: !!isStreaming,
    max_tokens: maxTokens,
    temperature: modelConfig.temperature ?? 0,
  });
  const safeExtraBody = filterLockedParams(extraBody ?? {});
  const commonConfig = {
    ...envCommonConfig,
    ...adapterChatCompletionParams,
  };
  const temperature = commonConfig.temperature;

  const {
    config: reasoningEffortConfig,
    debugMessage: reasoningEffortDebugMessage,
    warningMessage,
  } = resolveReasoningConfig({
    reasoningEnabled: mergedEnableReasoning,
    reasoningEffort: modelConfig.reasoningEffort,
    reasoningBudget: modelConfig.reasoningBudget,
    modelFamily,
  });
  if (reasoningEffortDebugMessage) {
    debugCall(reasoningEffortDebugMessage);
  }
  if (warningMessage) {
    warnCall(warningMessage);
  }
  const safeReasoningEffortConfig = filterLockedParams(reasoningEffortConfig);
  if (ignoredLockedParams.size > 0) {
    warnCall(
      `model adapter ${modelFamily || 'default'} locked request params: ${[...ignoredLockedParams].join(', ')}`,
    );
  }

  const imageDetail = adapter.chatCompletion.resolveImageDetail({
    intent: modelConfig.intent,
  });

  // For default-intent GPT-5 calls, request original image detail to preserve
  // screenshot resolution for localization-sensitive tasks.
  const messagesWithImageDetail: ChatCompletionMessageParam[] = (() => {
    if (!imageDetail) {
      return messages;
    }

    return messages.map((msg) => {
      if (!Array.isArray(msg.content)) {
        return msg;
      }

      const content = msg.content.map((part) => {
        if (part && part.type === 'image_url' && part.image_url?.url) {
          return {
            ...part,
            image_url: {
              ...part.image_url,
              detail: imageDetail,
            },
          };
        }
        return part;
      });

      return {
        ...msg,
        content,
      } as ChatCompletionMessageParam;
    });
  })();

  try {
    debugCall(
      `sending ${isStreaming ? 'streaming ' : ''}request to ${modelName}`,
    );

    if (isStreaming) {
      const { signal: streamSignal, cleanup: cleanupStreamSignal } =
        buildRequestAbortSignal(effectiveTimeoutMs, options?.abortSignal);
      try {
        const stream = (await completion.create(
          {
            model: modelName,
            messages: messagesWithImageDetail,
            ...commonConfig,
            ...safeReasoningEffortConfig,
            ...safeExtraBody,
            stream: true,
          },
          {
            stream: true,
            signal: streamSignal,
          },
        )) as Stream<OpenAI.Chat.Completions.ChatCompletionChunk> & {
          _request_id?: string | null;
        };

        requestId = stream._request_id;

        for await (const chunk of stream) {
          const content = chunk.choices?.[0]?.delta?.content || '';
          const reasoning_content =
            (chunk.choices?.[0]?.delta as any)?.reasoning_content || '';

          // Check for usage info in any chunk (OpenAI provides usage in separate chunks)
          if (chunk.usage) {
            usage = chunk.usage;
          }

          if (content || reasoning_content) {
            accumulated += content;
            accumulatedReasoning += reasoning_content;
            const chunkData: CodeGenerationChunk = {
              content,
              reasoning_content,
              accumulated,
              isComplete: false,
              usage: undefined,
            };
            options.onChunk!(chunkData);
          }

          // Check if stream is complete
          if (chunk.choices?.[0]?.finish_reason) {
            timeCost = Date.now() - startTime;

            // If usage is not available from the stream, provide a basic usage info
            if (!usage) {
              // Estimate token counts based on content length (rough approximation)
              const estimatedTokens = Math.max(
                1,
                Math.floor(accumulated.length / 4),
              );
              usage = {
                prompt_tokens: estimatedTokens,
                completion_tokens: estimatedTokens,
                total_tokens: estimatedTokens * 2,
              };
            }

            // Send final chunk
            const finalChunk: CodeGenerationChunk = {
              content: '',
              accumulated,
              reasoning_content: '',
              isComplete: true,
              usage: buildUsageInfo(usage, requestId),
            };
            options.onChunk!(finalChunk);
            break;
          }
        }
      } finally {
        cleanupStreamSignal();
      }
      content = accumulated;
      debugProfileStats(
        `streaming model, ${modelName}, mode, ${modelFamily || 'default'}, cost-ms, ${timeCost}, temperature, ${temperature ?? ''}`,
      );
    } else {
      // Non-streaming with retry logic
      const retryCount = modelConfig.retryCount ?? 1;
      const retryInterval = modelConfig.retryInterval ?? 2000;
      const maxAttempts = retryCount + 1; // retryCount=1 means 2 total attempts (1 initial + 1 retry)

      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { signal: attemptSignal, cleanup: cleanupAttemptSignal } =
          buildRequestAbortSignal(effectiveTimeoutMs, options?.abortSignal);
        try {
          const result = await completion.create(
            {
              model: modelName,
              messages: messagesWithImageDetail,
              ...commonConfig,
              ...safeReasoningEffortConfig,
              ...safeExtraBody,
              stream: false,
            } as any,
            { signal: attemptSignal },
          );

          timeCost = Date.now() - startTime;

          debugProfileStats(
            `model, ${modelName}, mode, ${modelFamily || 'default'}, prompt-tokens, ${result.usage?.prompt_tokens || ''}, completion-tokens, ${result.usage?.completion_tokens || ''}, total-tokens, ${result.usage?.total_tokens || ''}, cost-ms, ${timeCost}, requestId, ${result._request_id || ''}, temperature, ${temperature ?? ''}`,
          );

          debugProfileDetail(
            `model usage detail: ${JSON.stringify(result.usage)}`,
          );

          if (!result.choices) {
            throw new Error(
              `invalid response from LLM service: ${JSON.stringify(result)}`,
            );
          }

          content = result.choices[0].message.content!;
          accumulatedReasoning =
            (result.choices[0].message as any)?.reasoning_content || '';
          usage = result.usage;
          requestId = result._request_id;

          if (!hasUsableText(content) && hasUsableText(accumulatedReasoning)) {
            warnCall('empty content from AI model, using reasoning content');
            content = accumulatedReasoning;
          }

          if (!hasUsableText(content)) {
            throw new AIResponseParseError(
              'empty content from AI model',
              JSON.stringify(result),
              buildUsageInfo(usage, requestId),
            );
          }

          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as Error;
          const wasHardTimeout = isHardTimeoutError(lastError);
          if (wasHardTimeout) {
            warnCall(
              `AI call hit hard timeout (${effectiveTimeoutMs}ms, attempt ${attempt}/${maxAttempts}, model ${modelName}, slot ${modelConfig.slot})`,
            );
          }
          // Do not retry if the request was aborted by the caller
          if (options?.abortSignal?.aborted) {
            break;
          }
          if (attempt < maxAttempts) {
            warnCall(
              `AI call failed (attempt ${attempt}/${maxAttempts}), retrying in ${retryInterval}ms... Error: ${lastError.message}`,
            );
            await new Promise((resolve) => setTimeout(resolve, retryInterval));
          }
        } finally {
          cleanupAttemptSignal();
        }
      }

      if (!content) {
        throw lastError;
      }
    }

    debugCall(`response reasoning content: ${accumulatedReasoning}`);
    debugCall(`response content: ${content}`);

    // Ensure we always have usage info for streaming responses
    if (isStreaming && !usage) {
      // Estimate token counts based on content length (rough approximation)
      const estimatedTokens = Math.max(
        1,
        Math.floor((content || '').length / 4),
      );
      usage = {
        prompt_tokens: estimatedTokens,
        completion_tokens: estimatedTokens,
        total_tokens: estimatedTokens * 2,
      } as OpenAI.CompletionUsage;
    }

    return {
      content: content || '',
      reasoning_content: accumulatedReasoning || undefined,
      usage: buildUsageInfo(usage, requestId),
      isStreamed: !!isStreaming,
    };
  } catch (e: any) {
    warnCall('call AI error', e);

    if (e instanceof AIResponseParseError) {
      throw e;
    }

    const newError = new Error(
      `failed to call ${isStreaming ? 'streaming ' : ''}AI model service (${modelName}): ${e.message}\nTrouble shooting: https://midscenejs.com/model-provider.html`,
      {
        cause: e,
      },
    );
    throw newError;
  }
}

export async function callAIWithObjectResponse<T>(
  messages: ChatCompletionMessageParam[],
  modelConfig: IModelConfig,
  options?: {
    deepThink?: DeepThinkOption;
    abortSignal?: AbortSignal;
  },
): Promise<{
  content: T;
  contentString: string;
  usage?: AIUsageInfo;
  reasoning_content?: string;
}> {
  const response = await callAI(messages, modelConfig, {
    deepThink: options?.deepThink,
    abortSignal: options?.abortSignal,
  });
  assert(response, 'empty response');
  const modelFamily = modelConfig.modelFamily;
  const jsonContent = getModelAdapter(modelFamily).jsonParser(response.content);
  if (typeof jsonContent !== 'object') {
    throw new AIResponseParseError(
      `failed to parse json response from model (${modelConfig.modelName}): ${response.content}`,
      response.content,
      response.usage,
    );
  }
  return {
    content: jsonContent as T,
    contentString: response.content,
    usage: response.usage,
    reasoning_content: response.reasoning_content,
  };
}

export async function callAIWithStringResponse(
  msgs: AIArgs,
  modelConfig: IModelConfig,
  options?: {
    abortSignal?: AbortSignal;
  },
): Promise<{ content: string; usage?: AIUsageInfo }> {
  const { content, usage } = await callAI(msgs, modelConfig, {
    abortSignal: options?.abortSignal,
  });
  return { content, usage };
}
