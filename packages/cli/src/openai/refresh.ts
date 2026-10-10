import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import type { OpenAICredentials } from './credentials';
import { SiwcError, tokenResponseError, withSiwcStage } from './errors';

export async function refreshOpenAICredentials(
  saved: OpenAICredentials,
  signal: AbortSignal,
  dependencies?: { fetch: typeof fetch; keys: JWTVerifyGetKey },
): Promise<OpenAICredentials> {
  const issuer = 'https://auth.openai.com';
  signal.throwIfAborted();
  const response = await withSiwcStage('Token refresh', async () => {
    const result = await (dependencies?.fetch ?? fetch)(
      `${issuer}/api/accounts/oauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: saved.client_id,
          refresh_token: saved.refresh_token,
          resource: 'https://api.openai.com/v1',
        }),
        signal,
        redirect: 'error',
      },
    );
    if (!result.ok) {
      throw await tokenResponseError(result);
    }
    return result;
  });
  const tokens = await withSiwcStage('Refresh response parsing', () =>
    response.json(),
  );
  if (
    !tokens ||
    typeof tokens.access_token !== 'string' ||
    !tokens.access_token ||
    typeof tokens.refresh_token !== 'string' ||
    !tokens.refresh_token ||
    typeof tokens.expires_in !== 'number' ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0 ||
    typeof tokens.token_type !== 'string' ||
    tokens.token_type.toLowerCase() !== 'bearer' ||
    typeof tokens.scope !== 'string'
  ) {
    throw new SiwcError('OpenAI returned an invalid refresh response.');
  }
  const scopes = tokens.scope.split(/\s+/);
  if (!scopes.includes('chatgpt.tokens.use.direct')) {
    throw new SiwcError('ChatGPT plan usage is no longer authorized.');
  }
  if (tokens.id_token !== undefined) {
    if (typeof tokens.id_token !== 'string' || !tokens.id_token) {
      throw new SiwcError('Invalid refreshed ID token.');
    }
    const keys =
      dependencies?.keys ??
      createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    const { payload } = await withSiwcStage('ID token verification', () =>
      jwtVerify(tokens.id_token, keys, {
        issuer,
        audience: saved.client_id,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat'],
      }),
    );
    if (payload.sub !== saved.subject) {
      throw new SiwcError(
        'Refreshed identity does not match the saved account.',
      );
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
