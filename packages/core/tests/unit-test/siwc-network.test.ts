import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { SignJWT, exportJWK, generateKeyPair, jwtVerify } from 'jose';
import {
  createSiwcJWKSet,
  fetchSiwc,
} from '../../src/ai-model/service-caller/openai/siwc/network';

const mocks = rs.hoisted(() => ({
  close: rs.fn().mockResolvedValue(undefined),
  agent: rs.fn(),
  socksAgent: rs.fn(),
}));
rs.mock('#proxy-deps', () => ({
  loadFetchSocks: async () => ({
    socksDispatcher: (options: unknown) => {
      mocks.socksAgent(options);
      return { close: mocks.close };
    },
  }),
  loadUndici: async () => ({
    ProxyAgent: class {
      constructor(options: unknown) {
        mocks.agent(options);
      }
      close = mocks.close;
    },
  }),
}));

afterEach(() => {
  rs.unstubAllEnvs();
  rs.unstubAllGlobals();
  rs.clearAllMocks();
});

function setup() {
  for (const key of [
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'MIDSCENE_MODEL_HTTP_PROXY',
    'MIDSCENE_MODEL_SOCKS_PROXY',
  ]) {
    rs.stubEnv(key, '');
  }
  const request = rs
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ keys: [] }));
  rs.stubGlobal('fetch', request);
  return request;
}

describe('SIWC network', () => {
  it('prioritizes the Midscene HTTP proxy over SOCKS', async () => {
    const request = setup();
    rs.stubEnv('MIDSCENE_MODEL_HTTP_PROXY', 'http://localhost:17890');
    rs.stubEnv('HTTPS_PROXY', 'http://localhost:7890');
    rs.stubEnv('MIDSCENE_MODEL_SOCKS_PROXY', 'socks5://localhost:1080');
    const signal = new AbortController().signal;
    await fetchSiwc('https://auth.openai.com/api/accounts/oauth/token', {
      signal,
    });
    expect(mocks.agent).toHaveBeenCalledWith({
      uri: 'http://localhost:17890',
    });
    expect(request).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal, dispatcher: expect.any(Object) }),
    );
    expect(mocks.socksAgent).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it('uses the Midscene SOCKS proxy', async () => {
    const request = setup();
    rs.stubEnv('MIDSCENE_MODEL_SOCKS_PROXY', 'socks5://localhost:1080');
    rs.stubEnv('HTTPS_PROXY', 'http://localhost:7890');
    rs.stubEnv('HTTP_PROXY', 'http://localhost:7891');
    await fetchSiwc('https://auth.openai.com');
    expect(mocks.socksAgent).toHaveBeenCalledWith({
      type: 5,
      host: 'localhost',
      port: 1080,
    });
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ dispatcher: expect.any(Object) }),
    );
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it('does not create a dispatcher when no proxy is configured', async () => {
    const request = setup();
    await fetchSiwc('https://auth.openai.com');
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith('https://auth.openai.com', undefined);
  });

  it('does not create a proxy from generic environment variables', async () => {
    const request = setup();
    for (const key of [
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'http_proxy',
      'https_proxy',
    ]) {
      rs.stubEnv(key, 'http://localhost:7890');
    }
    await fetchSiwc('https://auth.openai.com');
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(mocks.socksAgent).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith('https://auth.openai.com', undefined);
  });

  it('verifies signatures with keys fetched through the proxy transport', async () => {
    const request = setup();
    rs.stubEnv('MIDSCENE_MODEL_HTTP_PROXY', 'http://localhost:7890');
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    request.mockResolvedValueOnce(
      Response.json({
        keys: [{ ...(await exportJWK(publicKey)), kid: 'test' }],
      }),
    );
    const token = await new SignJWT({ sub: 'user' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .sign(privateKey);
    const { payload } = await jwtVerify(
      token,
      createSiwcJWKSet('https://auth.openai.com', new AbortController().signal),
    );
    expect(payload.sub).toBe('user');
  });

  it('downloads JWKS through the same transport and reports HTTP failures', async () => {
    const request = setup();
    rs.stubEnv('MIDSCENE_MODEL_HTTP_PROXY', 'http://localhost:7890');
    request.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    const signal = new AbortController().signal;
    await expect(
      createSiwcJWKSet('https://auth.openai.com', signal)(
        { alg: 'RS256' },
        { payload: '', signature: '' },
      ),
    ).rejects.toThrow('HTTP 503');
    expect(request).toHaveBeenCalledWith(
      'https://auth.openai.com/.well-known/jwks.json',
      expect.objectContaining({ signal, dispatcher: expect.any(Object) }),
    );
  });
});
