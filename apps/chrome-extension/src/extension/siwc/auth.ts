import {
  type SiwcLoginAttempt,
  createSiwcAuthorization,
  exchangeSiwcCode,
  parseSiwcCallback,
} from '@midscene/core/ai-model';
import type { JWTVerifyGetKey } from 'jose';

export const SIWC_SESSION_KEY = 'midscene-siwc-session';
export const SIWC_LOGIN_MESSAGE = 'siwc-login';

export interface LoginAttempt extends SiwcLoginAttempt {
  tabId: number;
}

export interface LoginSession {
  attempt: LoginAttempt;
  status: 'waiting' | 'exchanging' | 'success' | 'error';
  error?: string;
}

export async function createAuthorization(
  tabId: number,
  hostId: string,
  clientId?: string,
) {
  // Choose from the dynamic/private range for each attempt.
  const port = 49152 + (crypto.getRandomValues(new Uint16Array(1))[0] % 16384);
  const { attempt, url } = await createSiwcAuthorization({
    hostId,
    clientId,
    redirectUri: `http://127.0.0.1:${port}/auth/callback`,
    agentName: 'Midscene Chrome Extension',
  });
  return { attempt: { ...attempt, tabId }, url };
}

export function parseCallback(
  url: string,
  tabId: number,
  attempt: LoginAttempt,
) {
  if (tabId !== attempt.tabId) {
    return undefined;
  }
  return parseSiwcCallback(url, attempt);
}

export function exchangeCode(
  attempt: LoginAttempt,
  callback: { code: string; clientId: string },
  dependencies?: { fetch: typeof fetch; keys: JWTVerifyGetKey },
) {
  return exchangeSiwcCode(
    attempt,
    callback,
    AbortSignal.timeout(30_000),
    dependencies,
  );
}
