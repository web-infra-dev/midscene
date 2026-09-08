import {
  type IModelConfig,
  MIDSCENE_LANGFUSE_DEBUG,
  MIDSCENE_LANGSMITH_DEBUG,
  type TModelFamily,
  globalConfigManager,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { ifInBrowser } from '@midscene/shared/utils';
import OpenAI from 'openai';
import { getVersion } from '../../utils';
import {
  type OpenAIErrorResponseContext,
  wrapOpenAICompatibleFetch,
} from './openai-error';
import { createProxyAgent } from './proxy';
import { resolveEffectiveTimeoutMs } from './request-timeout';

const createAndWrapClient = async ({
  openaiBaseURL,
  openaiApiKey,
  openaiExtraConfig,
  createOpenAIClient,
  effectiveTimeoutMs,
  proxyAgent,
  executionId,
  openAIErrorResponseContext,
}: {
  openaiBaseURL: IModelConfig['openaiBaseURL'];
  openaiApiKey: IModelConfig['openaiApiKey'];
  openaiExtraConfig: IModelConfig['openaiExtraConfig'];
  createOpenAIClient: IModelConfig['createOpenAIClient'];
  effectiveTimeoutMs: number | null;
  proxyAgent: Awaited<ReturnType<typeof createProxyAgent>>;
  executionId: string;
  openAIErrorResponseContext: OpenAIErrorResponseContext;
}): Promise<OpenAI> => {
  const warnClient = getDebug('ai:call', { console: true });

  const openAIOptions = {
    baseURL: openaiBaseURL,
    apiKey: openaiApiKey,
    // Use fetchOptions.dispatcher for fetch-based SDK instead of httpAgent
    // Note: Type assertion needed due to undici version mismatch between dependencies
    ...(proxyAgent ? { fetchOptions: { dispatcher: proxyAgent as any } } : {}),
    ...openaiExtraConfig,
    // Midscene exposes this setting through MIDSCENE_*_INIT_CONFIG_JSON, so
    // defaultHeaders is expected to be a plain JSON object rather than another
    // HeadersLike representation supported by the OpenAI SDK.
    defaultHeaders: {
      ...(openaiExtraConfig?.defaultHeaders as
        | Record<string, string>
        | undefined),
      // These Midscene-owned headers intentionally override user-supplied
      // headers with the same names.
      'x-midscene-version': getVersion(),
      'x-midscene-execution-id': executionId,
    },
    fetch: wrapOpenAICompatibleFetch(openAIErrorResponseContext),
    // Midscene already handles retries in callAI(), so disable SDK-level retries
    // to avoid duplicate attempts and duplicated backoff latency.
    maxRetries: 0,
    // When disabled (timeoutMs === null) fall through to the SDK default so
    // only the caller-provided abortSignal can cancel the request.
    ...(effectiveTimeoutMs !== null ? { timeout: effectiveTimeoutMs } : {}),
    dangerouslyAllowBrowser: true,
  };

  const baseOpenAI = new OpenAI(openAIOptions);

  let openai: OpenAI = baseOpenAI;

  // LangSmith wrapper
  if (
    openai &&
    globalConfigManager.getEnvConfigInBoolean(MIDSCENE_LANGSMITH_DEBUG)
  ) {
    if (ifInBrowser) {
      throw new Error('langsmith is not supported in browser');
    }
    warnClient('DEBUGGING MODE: langsmith wrapper enabled');
    // Use variable to prevent static analysis by bundlers
    const langsmithModule = 'langsmith/wrappers';
    const { wrapOpenAI } = await import(langsmithModule);
    openai = wrapOpenAI(openai);
  }

  // Langfuse wrapper
  if (
    openai &&
    globalConfigManager.getEnvConfigInBoolean(MIDSCENE_LANGFUSE_DEBUG)
  ) {
    if (ifInBrowser) {
      throw new Error('langfuse is not supported in browser');
    }
    warnClient('DEBUGGING MODE: langfuse wrapper enabled');
    // Use variable to prevent static analysis by bundlers
    const langfuseModule = '@langfuse/openai';
    const { observeOpenAI } = await import(langfuseModule);
    openai = observeOpenAI(openai);
  }

  if (createOpenAIClient) {
    const wrappedClient = await createOpenAIClient(baseOpenAI, openAIOptions);

    if (wrappedClient) {
      openai = wrappedClient as OpenAI;
    }
  }

  return openai;
};

export async function createChatClient({
  modelConfig,
  executionId,
  recordEvent,
}: {
  modelConfig: IModelConfig;
  executionId: string;
  recordEvent?: (event: Record<string, unknown>) => void;
}): Promise<{
  completion: OpenAI.Chat.Completions;
  modelName: string;
  modelDescription: string;
  modelFamily: TModelFamily | undefined;
  openAIErrorResponseContext: OpenAIErrorResponseContext;
}> {
  const {
    socksProxy,
    httpProxy,
    modelName,
    openaiBaseURL,
    openaiApiKey,
    openaiExtraConfig,
    modelDescription,
    modelFamily,
    createOpenAIClient,
    timeout,
  } = modelConfig;

  const proxyAgent = await createProxyAgent({ socksProxy, httpProxy });

  const effectiveTimeoutMs = resolveEffectiveTimeoutMs({ timeout });
  const openAIErrorResponseContext: OpenAIErrorResponseContext = {
    recordEvent,
  };

  const openai = await createAndWrapClient({
    openaiBaseURL,
    openaiApiKey,
    openaiExtraConfig,
    createOpenAIClient,
    effectiveTimeoutMs,
    proxyAgent,
    executionId,
    openAIErrorResponseContext,
  });

  return {
    completion: openai.chat.completions,
    modelName,
    modelDescription,
    modelFamily,
    openAIErrorResponseContext,
  };
}
