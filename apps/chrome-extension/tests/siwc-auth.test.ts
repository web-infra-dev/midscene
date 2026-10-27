import { createHash } from 'node:crypto';
import { SIWC_AUTH_STORAGE_KEY } from '@midscene/core/ai-model';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import {
  type LoginAttempt,
  SIWC_SESSION_KEY,
  createAuthorization,
  exchangeCode,
  parseCallback,
} from '../src/extension/siwc/auth';
import {
  captureSiwcCallback,
  startSiwcLogin,
} from '../src/extension/siwc/background';

afterEach(() => {
  rs.unstubAllGlobals();
});

function callbackUrl(attempt: LoginAttempt, state = attempt.state) {
  return `${attempt.redirectUri}?${new URLSearchParams({ state, code: 'code-test', client_id: 'issued-client' })}`;
}

async function fixture(failure?: string) {
  const { attempt, url } = await createAuthorization(7, 'host');
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const token = await new SignJWT({
    nonce: failure === 'nonce' ? 'wrong' : attempt.nonce,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer('https://auth.openai.com')
    .setAudience('issued-client')
    .setSubject('user')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);
  const request = rs.fn(async () =>
    Response.json({
      access_token: 'access',
      refresh_token: 'refresh',
      id_token: token,
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'openid chatgpt.tokens.use.direct',
    }),
  );
  const dependencies = {
    fetch: request as typeof fetch,
    keys: createLocalJWKSet({ keys: [await exportJWK(publicKey)] }),
  };
  return { attempt, url, request, dependencies };
}

describe('extension SIWC authorization', () => {
  it('uses fresh PKCE and initial registration parameters', async () => {
    const { attempt, url } = await createAuthorization(7, 'host');
    const params = new URL(url).searchParams;
    expect(params.get('client_id')).toBe('dynamic_agent_client');
    expect(params.get('agent_name_hint')).toBe('Midscene Chrome Extension');
    expect(params.get('redirect_uri')).toBe(attempt.redirectUri);
    const port = Number(new URL(attempt.redirectUri).port);
    expect(port).toBeGreaterThanOrEqual(49152);
    expect(port).toBeLessThanOrEqual(65535);
    expect(params.get('code_challenge')).toBe(
      createHash('sha256').update(attempt.verifier).digest('base64url'),
    );
    const next = await createAuthorization(7, 'host', 'issued-client');
    expect(next.attempt.state).not.toBe(attempt.state);
    expect(new URL(next.url).searchParams.get('client_id')).toBe(
      'issued-client',
    );
    expect(new URL(next.url).searchParams.has('agent_name_hint')).toBe(false);
  });

  it('accepts only the matching tab, callback, and state', async () => {
    const { attempt } = await createAuthorization(7, 'host');
    const url = callbackUrl(attempt);
    expect(parseCallback(url, 7, attempt)).toEqual({
      code: 'code-test',
      clientId: 'issued-client',
    });
    expect(parseCallback(url, 8, attempt)).toBeUndefined();
    const otherPort = new URL(url);
    otherPort.port = otherPort.port === '65535' ? '49152' : '65535';
    expect(parseCallback(otherPort.href, 7, attempt)).toBeUndefined();
    expect(
      parseCallback(url.replace('127.0.0.1', 'localhost'), 7, attempt),
    ).toBeUndefined();
    expect(
      parseCallback(callbackUrl(attempt, 'wrong'), 7, attempt),
    ).toBeUndefined();
    expect(
      parseCallback(`${url}&state=${attempt.state}`, 7, attempt),
    ).toBeUndefined();
    expect(() => parseCallback(`${url}&code=other`, 7, attempt)).toThrow(
      'Invalid',
    );
    expect(() => parseCallback(url, 7, { ...attempt, expiresAt: 0 })).toThrow(
      'timed out',
    );
    expect(() =>
      parseCallback(
        `${attempt.redirectUri}?state=${attempt.state}&error=access_denied`,
        7,
        attempt,
      ),
    ).toThrow('access_denied');
  });

  it('exchanges the code using the same redirect and PKCE, and validates the ID token', async () => {
    const { attempt, request, dependencies } = await fixture();
    const credentials = await exchangeCode(
      attempt,
      { code: 'code-test', clientId: 'issued-client' },
      dependencies,
    );
    expect(credentials).toMatchObject({
      access_token: 'access',
      subject: 'user',
      client_id: 'issued-client',
    });
    const body = (request.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as URLSearchParams;
    expect(body.get('redirect_uri')).toBe(attempt.redirectUri);
    expect(body.get('code_verifier')).toBe(attempt.verifier);
  });

  it('rejects incorrect nonce and exposes token endpoint failures', async () => {
    const { attempt, dependencies } = await fixture('nonce');
    await expect(
      exchangeCode(
        attempt,
        { code: 'code', clientId: 'issued-client' },
        dependencies,
      ),
    ).rejects.toThrow('nonce');
    await expect(
      exchangeCode(
        attempt,
        { code: 'code', clientId: 'issued-client' },
        {
          ...dependencies,
          fetch: async () => new Response('diagnostic detail', { status: 400 }),
        },
      ),
    ).rejects.toMatchObject({
      message:
        'Stage: Token exchange\nHTTP status: 400\nResponse body: diagnostic detail',
      cause: {
        message: 'HTTP status: 400\nResponse body: diagnostic detail',
      },
    });
  });

  it('captures duplicate redirects only once and shows exchange errors on the result page', async () => {
    const { attempt } = await createAuthorization(7, 'host');
    const session: Record<string, unknown> = {
      [SIWC_SESSION_KEY]: { attempt, status: 'waiting' },
    };
    const local: Record<string, unknown> = {};
    const storage = (data: Record<string, unknown>) => ({
      get: async () => ({ ...data }),
      set: async (values: Record<string, unknown>) => {
        Object.assign(data, values);
      },
    });
    const update = rs.fn(async () => ({}));
    rs.stubGlobal('chrome', {
      storage: { session: storage(session), local: storage(local) },
      tabs: { update },
      runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    });
    // Exercise the actual exchange error path without contacting OpenAI.
    const request = rs.fn(
      async () => new Response('exchange refused', { status: 400 }),
    );
    rs.stubGlobal('fetch', request);
    await Promise.all([
      captureSiwcCallback(callbackUrl(attempt), 7),
      captureSiwcCallback(callbackUrl(attempt), 7),
    ]);
    expect(request).toHaveBeenCalledTimes(1);
    expect(session[SIWC_SESSION_KEY]).toMatchObject({
      status: 'error',
      error: expect.stringContaining('exchange refused'),
    });
    expect(update).toHaveBeenCalledWith(7, {
      url: 'chrome-extension://test/siwc.html',
    });
    expect(local[SIWC_AUTH_STORAGE_KEY]).toBeUndefined();
  });

  it('starts authorization in a new tab and persists the attempt before navigating', async () => {
    const session: Record<string, unknown> = {};
    const local: Record<string, unknown> = {};
    const storage = (data: Record<string, unknown>) => ({
      get: async () => ({ ...data }),
      set: async (values: Record<string, unknown>) => {
        Object.assign(data, values);
      },
    });
    const update = rs.fn(async (tabId: number, { url }: { url: string }) => {
      expect(session[SIWC_SESSION_KEY]).toMatchObject({
        status: 'waiting',
        attempt: { tabId },
      });
      expect(new URL(url).hostname).toBe('auth.openai.com');
    });
    rs.stubGlobal('chrome', {
      storage: { session: storage(session), local: storage(local) },
      tabs: { create: rs.fn(async () => ({ id: 42 })), update },
      alarms: { create: rs.fn() },
    });
    await startSiwcLogin();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'about:blank',
      active: false,
    });
    expect(update).toHaveBeenCalledWith(42, {
      url: expect.stringContaining('https://auth.openai.com/'),
      active: true,
    });
    expect(update).toHaveBeenCalledTimes(1);
    await expect(startSiwcLogin()).rejects.toThrow('already in progress');
  });
});
