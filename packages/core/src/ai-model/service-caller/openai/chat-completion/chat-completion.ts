import { getDebug } from '@midscene/shared/logger';
import type { ResolveImageDetail } from '../../../model-adapter/types';
import type { ModelRequestConfigInput } from '../../../model-adapter/types';
import { createProxyAgentIfNeeded } from '../../proxy';
import type { ModelCallContext, OpenAIProtocolCallResult } from '../../types';
import { stringifyForDebug } from '../../utils';
import { callChatCompletionNonStreaming } from './non-stream';
import { callChatCompletionStream } from './stream';
import type { ChatCompletionCallOptions } from './types';
import { toChatMessages } from './utils';

export const prepareChatCompletion = async ({
  messages,
  modelRuntime,
  options,
}: Pick<ModelCallContext, 'messages' | 'modelRuntime' | 'options'>) => {
  const debugCall = getDebug('ai:call');
  const { config: modelConfig, adapter } = modelRuntime;

  const modelCallInput: ModelRequestConfigInput = {
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

  const resolveImageDetail: ResolveImageDetail = ({ imageDetail }) =>
    adapter.resolveImageDetail({
      imageDetail,
      intent: modelConfig.intent,
      requiresOriginalImageDetail: options?.requiresOriginalImageDetail,
    });

  const requestBodyParams: ChatCompletionCallOptions['requestBodyParams'] = {
    model: modelConfig.modelName,
    messages: toChatMessages(messages, resolveImageDetail),
    ...adapterChatCompletionParams,
    ...(modelConfig.extraBody ?? {}),
  };

  const proxyAgent = await createProxyAgentIfNeeded({
    socksProxy: modelConfig.socksProxy,
    httpProxy: modelConfig.httpProxy,
  });

  return {
    requestParams: requestBodyParams,
    extractContentAndReasoning:
      adapter.chatCompletion.extractContentAndReasoning,
    useReasoningAsContentFallback:
      adapter.chatCompletion.useReasoningAsContentFallback,
    proxyAgent,
  };
};

export function callChatCompletion(
  options: ChatCompletionCallOptions,
  stream: boolean,
): Promise<OpenAIProtocolCallResult> {
  return stream
    ? callChatCompletionStream(options)
    : callChatCompletionNonStreaming(options);
}
