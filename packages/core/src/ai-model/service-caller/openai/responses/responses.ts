import { getDebug } from '@midscene/shared/logger';
import type { ModelRequestConfigInput } from '../../../model-adapter/types';
import { createProxyAgentIfNeeded } from '../../proxy';
import type { ModelCallContext, OpenAIProtocolCallResult } from '../../types';
import { applyImageDetail, stringifyForDebug } from '../../utils';
import { callResponsesNonStreaming } from './non-stream';
import { callResponsesStream } from './stream';
import type { ResponsesCallOptions } from './types';
import { toResponsesInput } from './utils';

export async function prepareResponses({
  messages,
  modelRuntime,
  options,
}: Pick<ModelCallContext, 'messages' | 'modelRuntime' | 'options'>) {
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
  const { config } = adapter.responses.buildResponsesParams(modelCallInput);
  debugCall(`adapter responses params: ${stringifyForDebug({ config })}`);
  const imageDetail = adapter.resolveImageDetail({
    intent: modelConfig.intent,
    requiresOriginalImageDetail: options?.requiresOriginalImageDetail,
  });
  const requestParams = { ...config, ...modelConfig.extraBody };
  if (requestParams.background === true) {
    throw new Error('Responses background mode is not supported');
  }
  const messagesWithImageDetail = applyImageDetail({ messages, imageDetail });
  const requestBodyParams: ResponsesCallOptions['requestBodyParams'] = {
    // TODO: Consider previous_response_id or replaying reasoning items to reuse
    // reasoning state across turns. For now, send full message history without
    // storing responses; prompt caching remains available independently.
    store: false,
    ...requestParams,
    model: modelConfig.modelName,
    input: toResponsesInput(messagesWithImageDetail),
  };
  const proxyAgent = await createProxyAgentIfNeeded({
    socksProxy: modelConfig.socksProxy,
    httpProxy: modelConfig.httpProxy,
  });
  return {
    requestParams: requestBodyParams,
    proxyAgent,
  };
}

export function callResponses(
  options: ResponsesCallOptions,
  stream: boolean,
): Promise<OpenAIProtocolCallResult> {
  return stream
    ? callResponsesStream(options)
    : callResponsesNonStreaming(options);
}
