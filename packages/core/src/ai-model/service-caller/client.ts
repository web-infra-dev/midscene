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
import { resolveEffectiveTimeoutMs } from './request-timeout';

export async function createChatClient({
  modelConfig,
}: {
  modelConfig: IModelConfig;
}): Promise<{
  completion: OpenAI.Chat.Completions;
  modelName: string;
  modelDescription: string;
  modelFamily: TModelFamily | undefined;
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

  const sanitizeProxyUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      if (parsed.username) {
        parsed.password = '****';
        return parsed.href;
      }
      return url;
    } catch {
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
      const moduleName = 'undici';
      const { ProxyAgent } = await import(moduleName);
      proxyAgent = new ProxyAgent({
        uri: httpProxy,
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
        const moduleName = 'fetch-socks';
        const { socksDispatcher } = await import(moduleName);
        const proxyUrl = new URL(socksProxy);

        if (!proxyUrl.hostname) {
          throw new Error('SOCKS proxy URL must include a valid hostname');
        }

        const port = Number.parseInt(proxyUrl.port, 10);
        if (!proxyUrl.port || Number.isNaN(port)) {
          throw new Error('SOCKS proxy URL must include a valid port');
        }

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
  const openAIOptions = {
    baseURL: openaiBaseURL,
    apiKey: openaiApiKey,
    ...(proxyAgent ? { fetchOptions: { dispatcher: proxyAgent as any } } : {}),
    ...openaiExtraConfig,
    maxRetries: 0,
    ...(effectiveTimeoutMs !== null ? { timeout: effectiveTimeoutMs } : {}),
    dangerouslyAllowBrowser: true,
  };

  const baseOpenAI = new OpenAI(openAIOptions);

  let openai: OpenAI = baseOpenAI;

  if (
    openai &&
    globalConfigManager.getEnvConfigInBoolean(MIDSCENE_LANGSMITH_DEBUG)
  ) {
    if (ifInBrowser) {
      throw new Error('langsmith is not supported in browser');
    }
    warnClient('DEBUGGING MODE: langsmith wrapper enabled');
    const langsmithModule = 'langsmith/wrappers';
    const { wrapOpenAI } = await import(langsmithModule);
    openai = wrapOpenAI(openai);
  }

  if (
    openai &&
    globalConfigManager.getEnvConfigInBoolean(MIDSCENE_LANGFUSE_DEBUG)
  ) {
    if (ifInBrowser) {
      throw new Error('langfuse is not supported in browser');
    }
    warnClient('DEBUGGING MODE: langfuse wrapper enabled');
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
  };
}
