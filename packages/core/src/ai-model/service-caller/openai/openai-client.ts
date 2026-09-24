import {
  type IModelConfig,
  MIDSCENE_LANGFUSE_DEBUG,
  MIDSCENE_LANGSMITH_DEBUG,
  globalConfigManager,
} from '@midscene/shared/env';
import { getDebug } from '@midscene/shared/logger';
import { ifInBrowser } from '@midscene/shared/utils';
import OpenAI from 'openai';
import { getVersion } from '../../../utils';
import type { createProxyAgentIfNeeded } from '../proxy';
import {
  type OpenAIRequestContext,
  wrapOpenAICompatibleFetch,
} from './openai-request-context';

const createAndWrapClient = async ({
  openaiBaseURL,
  openaiApiKey,
  openaiExtraConfig,
  createOpenAIClient,
  effectiveTimeoutMs,
  proxyAgent,
  executionId,
  openAIRequestContext,
}: {
  openaiBaseURL: IModelConfig['openaiBaseURL'];
  openaiApiKey: IModelConfig['openaiApiKey'];
  openaiExtraConfig: IModelConfig['openaiExtraConfig'];
  createOpenAIClient: IModelConfig['createOpenAIClient'];
  effectiveTimeoutMs: number | null;
  proxyAgent: Awaited<ReturnType<typeof createProxyAgentIfNeeded>>;
  executionId: string;
  openAIRequestContext: OpenAIRequestContext;
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
    fetch: wrapOpenAICompatibleFetch(openAIRequestContext),
    // Midscene handles request retries in callAI(), so disable SDK-level retries
    // to avoid duplicate attempts and duplicated backoff latency.
    maxRetries: 0,
    // Disabling the Midscene hard timeout leaves the SDK timeout at its
    // configured value or default; it does not disable SDK/network timeouts.
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

export async function createClient({
  modelConfig,
  proxyAgent,
  effectiveTimeoutMs,
  executionId,
  recordEvent,
}: {
  modelConfig: IModelConfig;
  proxyAgent: Awaited<ReturnType<typeof createProxyAgentIfNeeded>>;
  effectiveTimeoutMs: number | null;
  executionId: string;
  recordEvent?: (event: Record<string, unknown>) => void;
}): Promise<{
  openai: OpenAI;
  openAIRequestContext: OpenAIRequestContext;
}> {
  const { openaiBaseURL, openaiApiKey, openaiExtraConfig, createOpenAIClient } =
    modelConfig;

  const openAIRequestContext: OpenAIRequestContext = {
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
    openAIRequestContext,
  });

  return {
    openai,
    openAIRequestContext,
  };
}
