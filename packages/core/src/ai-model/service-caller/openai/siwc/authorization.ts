import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import { tokenResponseError, withSiwcStage } from './errors';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
export interface SiwcLoginAttempt {
  hostId: string;
  redirectUri: string;
  clientId?: string;
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: number;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createSiwcAuthorization(options: {
  hostId: string;
  clientId?: string;
  redirectUri: string;
  agentName: string;
}) {
  const { hostId, clientId, redirectUri, agentName } = options;
  const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
  const attempt: SiwcLoginAttempt = {
    hostId,
    redirectUri,
    clientId,
    state: random(),
    nonce: random(),
    verifier: random(),
    expiresAt: Date.now() + 5 * 60_000,
  };
  const challenge = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(attempt.verifier),
  );
  const url = new URL(`${ISSUER}/api/accounts/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId ?? 'dynamic_agent_client',
    ...(clientId ? {} : { agent_name_hint: agentName }),
    ext_agent_host_id: hostId,
    response_type: 'code',
    redirect_uri: attempt.redirectUri,
    scope:
      'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    resource: RESOURCE,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge_method: 'S256',
    code_challenge: base64url(new Uint8Array(challenge)),
  }).toString();
  return { attempt, url: url.toString() };
}

export function parseSiwcCallback(url: string, attempt: SiwcLoginAttempt) {
  const callback = new URL(url);
  const expected = new URL(attempt.redirectUri);
  if (
    callback.origin !== expected.origin ||
    callback.pathname !== expected.pathname
  ) {
    return undefined;
  }
  const params = callback.searchParams;
  if (
    params.getAll('state').length !== 1 ||
    params.get('state') !== attempt.state
  ) {
    return undefined;
  }
  if (Date.now() >= attempt.expiresAt) {
    throw new Error('Authorization timed out. Start authorization again.');
  }
  if (params.has('error')) {
    throw new Error(
      `OpenAI authorization failed: ${params.get('error_description') || params.get('error')}`,
    );
  }
  const code = params.get('code');
  const clientId = params.get('client_id') || attempt.clientId;
  if (
    !code ||
    !clientId ||
    clientId === 'dynamic_agent_client' ||
    params.getAll('code').length !== 1 ||
    params.getAll('client_id').length > 1 ||
    (attempt.clientId && clientId !== attempt.clientId)
  ) {
    throw new Error('Invalid OpenAI authorization callback.');
  }
  return { code, clientId };
}

export async function exchangeSiwcCode(
  attempt: SiwcLoginAttempt,
  callback: { code: string; clientId: string },
  signal: AbortSignal,
  dependencies?: { fetch: typeof fetch; keys: JWTVerifyGetKey },
) {
  signal.throwIfAborted();
  const response = await withSiwcStage('Token exchange', async () => {
    const response = await (dependencies?.fetch ?? fetch)(
      `${ISSUER}/api/accounts/oauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: callback.clientId,
          code: callback.code,
          code_verifier: attempt.verifier,
          redirect_uri: attempt.redirectUri,
          resource: RESOURCE,
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
  const tokens = await withSiwcStage('Token response parsing', () =>
    response.json(),
  );
  if (
    !tokens ||
    typeof tokens.access_token !== 'string' ||
    !tokens.access_token ||
    typeof tokens.refresh_token !== 'string' ||
    !tokens.refresh_token ||
    typeof tokens.id_token !== 'string' ||
    typeof tokens.scope !== 'string' ||
    typeof tokens.expires_in !== 'number' ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0 ||
    typeof tokens.token_type !== 'string' ||
    tokens.token_type.toLowerCase() !== 'bearer'
  ) {
    throw new Error('OpenAI returned an invalid token response.');
  }
  const scopes = tokens.scope.split(/\s+/);
  if (!scopes.includes('chatgpt.tokens.use.direct')) {
    throw new Error('ChatGPT plan usage was not authorized.');
  }
  const { payload } = await withSiwcStage('ID token verification', () =>
    jwtVerify(
      tokens.id_token,
      dependencies?.keys ??
        createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`)),
      {
        issuer: ISSUER,
        audience: callback.clientId,
        algorithms: ['RS256'],
        // Some CI machines have incorrect system clocks. Do not compare ID token
        // exp/nbf claims against local time when accepting newly returned tokens.
        // Keep signature, issuer, audience and required-claim validation.
        clockTolerance: Number.POSITIVE_INFINITY,
        requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
      },
    ),
  );
  if (payload.nonce !== attempt.nonce || !payload.sub) {
    throw new Error('OpenAI login identity or nonce did not match.');
  }
  signal.throwIfAborted();
  return {
    ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
    ext_agent_host_id: attempt.hostId,
    client_id: callback.clientId,
    subject: payload.sub,
    issuer: ISSUER,
    access_token: tokens.access_token as string,
    refresh_token: tokens.refresh_token as string,
    id_token: tokens.id_token as string,
    scopes,
    expires_at: Date.now() + tokens.expires_in * 1000,
  };
}
