import { type JWTVerifyGetKey, jwtVerify } from 'jose';
import { tokenResponseError, withSiwcStage } from './errors';
import { createSiwcJWKSet, fetchSiwc } from './network';
interface RefreshableCredentials {
  client_id?: string;
  refresh_token?: string;
  subject?: string;
  id_token?: string;
}

export async function refreshSiwcCredentials<T extends RefreshableCredentials>(
  saved: T,
  signal: AbortSignal,
  dependencies?: { fetch: typeof fetch; keys: JWTVerifyGetKey },
) {
  const { client_id: clientId, refresh_token: refreshToken } = saved;
  if (!clientId || !refreshToken) {
    throw new Error('Missing client ID or refresh token.');
  }
  const issuer = 'https://auth.openai.com';
  signal.throwIfAborted();
  const response = await withSiwcStage('Token refresh', async () => {
    const response = await (dependencies?.fetch ?? fetchSiwc)(
      `${issuer}/api/accounts/oauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          refresh_token: refreshToken,
          resource: 'https://api.openai.com/v1',
        }),
        signal,
        redirect: 'error',
      },
    );
    if (!response.ok) {
      throw await tokenResponseError(response);
    }
    return response;
  });
  const tokens = await withSiwcStage('Refresh response parsing', () =>
    response.json(),
  );
  if (
    !tokens ||
    typeof tokens.access_token !== 'string' ||
    !tokens.access_token.trim() ||
    typeof tokens.refresh_token !== 'string' ||
    !tokens.refresh_token.trim() ||
    typeof tokens.expires_in !== 'number' ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0 ||
    typeof tokens.token_type !== 'string' ||
    tokens.token_type.toLowerCase() !== 'bearer' ||
    typeof tokens.scope !== 'string'
  ) {
    throw new Error('OpenAI returned an invalid refresh response.');
  }
  const scopes = tokens.scope.split(/\s+/);
  if (!scopes.includes('chatgpt.tokens.use.direct')) {
    throw new Error('ChatGPT plan usage is no longer authorized.');
  }
  if (tokens.id_token !== undefined) {
    if (typeof tokens.id_token !== 'string' || !tokens.id_token) {
      throw new Error('Invalid refreshed ID token.');
    }
    const keys = dependencies?.keys ?? createSiwcJWKSet(issuer, signal);
    const { payload } = await withSiwcStage('ID token verification', () =>
      jwtVerify(tokens.id_token, keys, {
        issuer,
        audience: saved.client_id,
        algorithms: ['RS256'],
        // Some CI machines have incorrect system clocks. Do not compare ID token
        // exp/nbf claims against local time when accepting newly returned tokens.
        // Keep signature, issuer, audience and required-claim validation.
        clockTolerance: Number.POSITIVE_INFINITY,
        requiredClaims: ['sub', 'exp', 'iat'],
      }),
    );
    if (payload.sub !== saved.subject) {
      throw new Error('Refreshed identity does not match the saved account.');
    }
  }
  signal.throwIfAborted();
  return {
    ...saved,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    id_token: tokens.id_token ?? saved.id_token,
    scopes,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}
