import { getDebug } from '@midscene/shared/logger';
import type { ChatCompletionCallInput } from '../../../model-adapter/types';
import { createProxyAgentIfNeeded } from '../../proxy';
import type { ModelCallContext, OpenAIProtocolCallResult } from '../../types';
import { applyImageDetail, stringifyForDebug } from '../../utils';
import { callChatCompletionNonStreaming } from './non-stream';
import { callChatCompletionStream } from './stream';
import type { ChatCompletionCallOptions } from './types';

export const prepareChatCompletion = async ({
  messages,
  modelRuntime,
  options,
}: Pick<ModelCallContext, 'messages' | 'modelRuntime' | 'options'>) => {
  const debugCall = getDebug('ai:call');
  const { config: modelConfig, adapter } = modelRuntime;

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

  const requestBodyParams = {
    ...adapterChatCompletionParams,
    ...(modelConfig.extraBody ?? {}),
  };

  const imageDetail = adapter.chatCompletion.resolveImageDetail(modelCallInput);

  // Some adapters request original image detail to preserve screenshot
  // resolution for localization-sensitive tasks.
  const messagesWithImageDetail = applyImageDetail({ imageDetail, messages });

  const proxyAgent = await createProxyAgentIfNeeded({
    socksProxy: modelConfig.socksProxy,
    httpProxy: modelConfig.httpProxy,
  });

  return {
    messages: messagesWithImageDetail,
    requestParams: requestBodyParams,
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
