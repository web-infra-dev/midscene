import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
export const SIWC_SESSION_KEY = 'midscene-siwc-session';
export const SIWC_LOGIN_MESSAGE = 'siwc-login';

export interface LoginAttempt {
  tabId: number;
  hostId: string;
  redirectUri: string;
  clientId?: string;
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: number;
}

export interface LoginSession {
  attempt: LoginAttempt;
  status: 'waiting' | 'exchanging' | 'success' | 'error';
  error?: string;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createAuthorization(
  tabId: number,
  hostId: string,
  clientId?: string,
) {
  const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
  // Choose from the dynamic/private range (49152–65535) for each attempt.
  const port = 49152 + (crypto.getRandomValues(new Uint16Array(1))[0] % 16384);
  const attempt: LoginAttempt = {
    tabId,
    hostId,
    redirectUri: `http://127.0.0.1:${port}/auth/callback`,
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
    ...(clientId ? {} : { agent_name_hint: 'Midscene' }),
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

export function parseCallback(
  url: string,
  tabId: number,
  attempt: LoginAttempt,
) {
  const callback = new URL(url);
  const expected = new URL(attempt.redirectUri);
  if (
    tabId !== attempt.tabId ||
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

export async function exchangeCode(
  attempt: LoginAttempt,
  callback: { code: string; clientId: string },
  dependencies?: { fetch: typeof fetch; keys: JWTVerifyGetKey },
) {
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
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    },
  );
  if (!response.ok) {
    throw new Error(
      `OpenAI token exchange failed (HTTP ${response.status}): ${await response.text()}`,
    );
  }
  const tokens = await response.json();
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
  const { payload } = await jwtVerify(
    tokens.id_token,
    dependencies?.keys ??
      createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`)),
    {
      issuer: ISSUER,
      audience: callback.clientId,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
    },
  );
  if (payload.nonce !== attempt.nonce || !payload.sub) {
    throw new Error('OpenAI login identity or nonce did not match.');
  }
  return {
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
