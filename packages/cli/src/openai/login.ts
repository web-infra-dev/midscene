import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from 'jose';
import { SiwcError, tokenResponseError, withSiwcStage } from './errors';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';

interface LoginOptions {
  hostId?: string;
  clientId?: string;
  port?: number;
  signal: AbortSignal;
  onAuthorization: (url: string) => Promise<void>;
}

interface LoginDependencies {
  fetch: typeof fetch;
  keys: JWTVerifyGetKey;
}

export async function loginWithOpenAI(
  options: LoginOptions,
  dependencies?: LoginDependencies,
) {
  const hostId = options.hostId ?? `urn:uuid:${randomUUID()}`;
  const existingClientId = options.clientId;
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const signal = options.signal;
  signal.throwIfAborted();
  const server = createServer();
  const callback = new Promise<{ code: string; clientId: string }>(
    (resolve, reject) => {
      const consumed = { value: false };
      server.on('request', (request, response) => {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Referrer-Policy', 'no-referrer');
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (request.method !== 'GET' || url.pathname !== '/auth/callback') {
          response.writeHead(404).end('Not found');
          return;
        }
        if (
          url.searchParams.getAll('state').length !== 1 ||
          url.searchParams.get('state') !== state
        ) {
          response
            .writeHead(400)
            .end('Invalid login state. Use the original authorization link.');
          return;
        }
        if (consumed.value) {
          response.writeHead(409).end('Authorization already received.');
          return;
        }
        if (url.searchParams.has('error')) {
          consumed.value = true;
          response
            .writeHead(400)
            .end('Authorization was not granted. Return to the terminal.');
          reject(new SiwcError('OpenAI authorization was denied or failed.'));
          return;
        }
        const code = url.searchParams.get('code');
        const clientId = url.searchParams.get('client_id') || existingClientId;
        if (
          !code ||
          !clientId ||
          clientId === 'dynamic_agent_client' ||
          (existingClientId && clientId !== existingClientId) ||
          url.searchParams.getAll('code').length !== 1 ||
          url.searchParams.getAll('client_id').length > 1
        ) {
          response.writeHead(400).end('Invalid authorization callback.');
          return;
        }
        consumed.value = true;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorization received · Midscene</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f6f7f9; color: #202124; font-family: system-ui, sans-serif; }
    main { width: 100%; max-width: 480px; padding: 40px 28px; text-align: center; background: white; border: 1px solid #e5e7eb; border-radius: 20px; box-shadow: 0 8px 32px #00000008; }
    h1 { margin: 0 0 20px; font-size: 24px; line-height: 1.4; }
    h1 span { color: #16834a; }
    p { margin: 8px 0 0; color: #596273; font-size: 15px; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <h1><span aria-hidden="true">✓</span> Authorization received</h1>
    <p>You can close this tab.</p>
    <p>Check your terminal for the sign-in result and access token.</p>
  </main>
</body>
</html>`);
        resolve({ code, clientId });
      });
      server.on('error', reject);
    },
  );
  // Attach immediately: browser launch or server startup can fail before awaiting the callback.
  void callback.catch(() => undefined);
  const abort = () =>
    server.emit('error', new SiwcError('OpenAI login cancelled or timed out.'));
  signal.addEventListener('abort', abort, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    signal.throwIfAborted();
    const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/callback`;
    const authorization = new URL(`${ISSUER}/api/accounts/authorize`);
    authorization.search = new URLSearchParams({
      client_id: existingClientId ?? 'dynamic_agent_client',
      ...(existingClientId ? {} : { agent_name_hint: 'Midscene' }),
      ext_agent_host_id: hostId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES,
      resource: RESOURCE,
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    }).toString();
    await options.onAuthorization(authorization.toString());
    const { code, clientId } = await withSiwcStage(
      'Authorization callback',
      () => callback,
    );
    signal.throwIfAborted();
    const request = dependencies?.fetch ?? fetch;
    const result = await withSiwcStage('Token exchange', async () => {
      const response = await request(`${ISSUER}/api/accounts/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
          resource: RESOURCE,
        }),
        signal,
        redirect: 'error',
      });
      if (!response.ok) {
        throw await tokenResponseError(response);
      }
      return response;
    });
    const tokens = (await withSiwcStage('Token response parsing', () =>
      result.json(),
    )) as Record<string, unknown>;
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
      throw new SiwcError('OpenAI returned an invalid token response.');
    }
    const scopes = tokens.scope.split(/\s+/);
    if (!scopes.includes('chatgpt.tokens.use.direct')) {
      throw new SiwcError(
        'ChatGPT plan usage was not authorized. Run midscene model siwc login again and grant access.',
      );
    }
    const keys =
      dependencies?.keys ??
      createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
    const { payload } = await withSiwcStage('ID token verification', () =>
      jwtVerify(tokens.id_token as string, keys, {
        issuer: ISSUER,
        audience: clientId,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
      }),
    );
    if (payload.nonce !== nonce || !payload.sub) {
      throw new SiwcError('OpenAI login identity or nonce did not match.');
    }
    signal.throwIfAborted();
    return {
      ext_agent_host_id: hostId,
      client_id: clientId,
      subject: payload.sub,
      issuer: ISSUER,
      ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token,
      scopes,
      expires_at: Date.now() + tokens.expires_in * 1000,
    };
  } finally {
    signal.removeEventListener('abort', abort);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
