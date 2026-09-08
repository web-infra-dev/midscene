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
import { resolveEffectiveTimeoutMs } from './request-timeout';

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

  let proxyAgent: any = undefined;
  const warnClient = getDebug('ai:call', { console: true });
  const debugProxy = getDebug('ai:call:proxy');
  const warnProxy = getDebug('ai:call:proxy', { console: true });

  // Helper function to sanitize proxy URL for logging (remove credentials)
  // Uses URL API instead of regex to avoid ReDoS vulnerabilities
  const sanitizeProxyUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      if (parsed.username) {
        // Keep username for debugging, hide password for security
        parsed.password = '****';
        return parsed.href;
      }
      return url;
    } catch {
      // If URL parsing fails, return original URL (will be caught later)
      return url;
    }
  };

  if (httpProxy) {
    debugProxy('using http proxy', sanitizeProxyUrl(httpProxy));
    if (ifInBrowser) {
      warnProxy(
        'HTTP proxy is configured but not supported in browser environment',
      );
    } else {
      const { loadUndici } = await import('#proxy-deps');
      const { ProxyAgent } = await loadUndici();
      proxyAgent = new ProxyAgent({
        uri: httpProxy,
        // Note: authentication is handled via the URI (e.g., http://user:pass@proxy.com:8080)
      });
    }
  } else if (socksProxy) {
    debugProxy('using socks proxy', sanitizeProxyUrl(socksProxy));
    if (ifInBrowser) {
      warnProxy(
        'SOCKS proxy is configured but not supported in browser environment',
      );
    } else {
      try {
        const { loadFetchSocks } = await import('#proxy-deps');
        const { socksDispatcher } = await loadFetchSocks();
        // Parse SOCKS proxy URL (e.g., socks5://127.0.0.1:1080)
        const proxyUrl = new URL(socksProxy);

        // Validate hostname
        if (!proxyUrl.hostname) {
          throw new Error('SOCKS proxy URL must include a valid hostname');
        }

        // Validate and parse port
        const port = Number.parseInt(proxyUrl.port, 10);
        if (!proxyUrl.port || Number.isNaN(port)) {
          throw new Error('SOCKS proxy URL must include a valid port');
        }

        // Parse SOCKS version from protocol
        const protocol = proxyUrl.protocol.replace(':', '');
        const socksType =
          protocol === 'socks4' ? 4 : protocol === 'socks5' ? 5 : 5;

        proxyAgent = socksDispatcher({
          type: socksType,
          host: proxyUrl.hostname,
          port,
          ...(proxyUrl.username
            ? {
                userId: decodeURIComponent(proxyUrl.username),
                password: decodeURIComponent(proxyUrl.password || ''),
              }
            : {}),
        });
        debugProxy('socks proxy configured successfully', {
          type: socksType,
          host: proxyUrl.hostname,
          port: port,
        });
      } catch (error) {
        warnProxy('Failed to configure SOCKS proxy:', error);
        throw new Error(
          `Invalid SOCKS proxy URL: ${socksProxy}. Expected format: socks4://host:port, socks5://host:port, or with authentication: socks5://user:pass@host:port`,
        );
      }
    }
  }

  const effectiveTimeoutMs = resolveEffectiveTimeoutMs({ timeout });
  const openAIErrorResponseContext: OpenAIErrorResponseContext = {
    recordEvent,
  };
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

  return {
    completion: openai.chat.completions,
    modelName,
    modelDescription,
    modelFamily,
    openAIErrorResponseContext,
  };
}
