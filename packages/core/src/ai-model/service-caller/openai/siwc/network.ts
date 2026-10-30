import { ifInBrowser } from '@midscene/shared/utils';
import { type JWTVerifyGetKey, createLocalJWKSet } from 'jose';
import type { Dispatcher } from 'undici';
import { createProxyAgentIfNeeded } from '../../proxy';

// Authentication is independent of model selection. Read only proxy settings,
// without requiring a model name, family, or API Key.
export const fetchSiwc: typeof fetch = async (input, init) => {
  if (ifInBrowser) {
    return fetch(input, init);
  }
  const dispatcher = (await createProxyAgentIfNeeded({
    httpProxy: process.env.MIDSCENE_MODEL_HTTP_PROXY?.trim() || undefined,
    socksProxy: process.env.MIDSCENE_MODEL_SOCKS_PROXY?.trim() || undefined,
  })) as Dispatcher | undefined;
  if (!dispatcher) {
    return fetch(input, init);
  }
  try {
    return await fetch(input, { ...init, dispatcher } as RequestInit);
  } finally {
    // Graceful close waits for the response body to be consumed by the caller.
    void dispatcher.close();
  }
};

export function createSiwcJWKSet(
  issuer: string,
  signal: AbortSignal,
): JWTVerifyGetKey {
  return async (header, token) => {
    const response = await fetchSiwc(`${issuer}/.well-known/jwks.json`, {
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAI JWKS: HTTP ${response.status}`);
    }
    return createLocalJWKSet(await response.json())(header, token);
  };
}
