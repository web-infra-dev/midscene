import { ifInBrowser } from '@midscene/shared/utils';
import { type JWTVerifyGetKey, createLocalJWKSet } from 'jose';
import type { Dispatcher } from 'undici';
import { createProxyAgentIfNeeded } from '../../proxy';

export interface SiwcProxyConfig {
  httpProxy?: string;
  socksProxy?: string;
}

export async function fetchSiwc(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
  proxy?: SiwcProxyConfig,
) {
  if (ifInBrowser) {
    return fetch(input, init);
  }
  const { httpProxy, socksProxy } = proxy ?? {
    httpProxy: process.env.MIDSCENE_MODEL_HTTP_PROXY?.trim() || undefined,
    socksProxy: process.env.MIDSCENE_MODEL_SOCKS_PROXY?.trim() || undefined,
  };
  const dispatcher = (await createProxyAgentIfNeeded({
    httpProxy,
    socksProxy,
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
}

export function createSiwcJWKSet(
  issuer: string,
  signal: AbortSignal,
  request: typeof fetch = fetchSiwc,
): JWTVerifyGetKey {
  return async (header, token) => {
    const response = await request(`${issuer}/.well-known/jwks.json`, {
      signal,
      redirect: 'error',
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAI JWKS: HTTP ${response.status}`);
    }
    return createLocalJWKSet(await response.json())(header, token);
  };
}
