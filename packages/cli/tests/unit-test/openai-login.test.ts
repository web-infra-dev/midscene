import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from '@rstest/core';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { loginWithOpenAI } from '../../src/openai/login';

async function fixture(failure?: string) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const authorization: { url?: URL } = {};
  const controller = new AbortController();
  const calls: URLSearchParams[] = [];
  const dependencies = {
    keys: createLocalJWKSet({
      keys: [{ ...(await exportJWK(publicKey)), kid: 'test' }],
    }),
    fetch: (async (_url, init) => {
      const body = init!.body as URLSearchParams;
      calls.push(body);
      expect(body.get('client_id')).toBe('oaiapp_test');
      expect(body.get('redirect_uri')).toBe(
        authorization.url!.searchParams.get('redirect_uri'),
      );
      expect(
        createHash('sha256')
          .update(body.get('code_verifier')!)
          .digest('base64url'),
      ).toBe(authorization.url!.searchParams.get('code_challenge'));
      if (failure === 'http') {
        return new Response('secret-error-body', { status: 400 });
      }
      const idToken = await new SignJWT({
        nonce:
          failure === 'nonce'
            ? 'wrong'
            : authorization.url!.searchParams.get('nonce'),
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer(
          failure === 'issuer'
            ? 'https://evil.example'
            : 'https://auth.openai.com',
        )
        .setSubject('test-user')
        .setAudience(failure === 'audience' ? 'other-client' : 'oaiapp_test')
        .setIssuedAt()
        .setExpirationTime(failure === 'expired' ? '0s' : '5m')
        .sign(
          failure === 'signature'
            ? (await generateKeyPair('RS256')).privateKey
            : privateKey,
        );
      return Response.json({
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        token_type: 'Bearer',
        expires_in: 3600,
        scope:
          failure === 'scope' ? 'openid' : 'openid chatgpt.tokens.use.direct',
        id_token: idToken,
      });
    }) as typeof fetch,
  };
  const receive = async (url: string) => {
    authorization.url = new URL(url);
    const callback = new URL(
      authorization.url.searchParams.get('redirect_uri')!,
    );
    callback.search = new URLSearchParams({
      state: authorization.url.searchParams.get('state')!,
      code: 'test-code',
      client_id: 'oaiapp_test',
    }).toString();
    return callback;
  };
  return { authorization, controller, calls, dependencies, receive };
}

describe('OpenAI loopback login', () => {
  it('uses PKCE, ignores invalid callbacks, returns verified credentials and closes the server', async () => {
    const context = await fixture();
    const result = await loginWithOpenAI(
      {
        signal: context.controller.signal,
        onAuthorization: async (url) => {
          const callback = await context.receive(url);
          expect(callback.hostname).toBe('127.0.0.1');
          expect(new URL(url).searchParams.get('client_id')).toBe(
            'dynamic_agent_client',
          );
          const wrong = new URL(callback);
          wrong.searchParams.set('state', 'wrong');
          expect((await fetch(wrong)).status).toBe(400);
          wrong.pathname = '/favicon.ico';
          expect((await fetch(wrong)).status).toBe(404);
          const incomplete = new URL(callback);
          incomplete.searchParams.delete('client_id');
          expect((await fetch(incomplete)).status).toBe(400);
          expect((await fetch(callback)).status).toBe(200);
          expect((await fetch(callback)).status).toBe(409);
        },
      },
      context.dependencies,
    );
    expect(result.access_token).toBe('access-secret');
    expect(result.subject).toBe('test-user');
    expect(result.ext_agent_host_id).toMatch(/^urn:uuid:/);
    expect(context.calls).toHaveLength(1);
    await expect(
      fetch(context.authorization.url!.searchParams.get('redirect_uri')!),
    ).rejects.toThrow();
  });

  for (const failure of [
    'nonce',
    'issuer',
    'audience',
    'expired',
    'signature',
    'scope',
    'http',
  ]) {
    it(`does not return credentials on ${failure} failure`, async () => {
      const context = await fixture(failure);
      await expect(
        loginWithOpenAI(
          {
            signal: context.controller.signal,
            onAuthorization: async (url) => {
              await fetch(await context.receive(url));
            },
          },
          context.dependencies,
        ),
      ).rejects.toThrow();
    });
  }

  it('reuses supplied registration and host identifiers', async () => {
    const context = await fixture();
    const result = await loginWithOpenAI(
      {
        hostId: 'urn:uuid:test-host',
        clientId: 'oaiapp_test',
        signal: context.controller.signal,
        onAuthorization: async (url) => {
          const callback = await context.receive(url);
          expect(new URL(url).searchParams.has('agent_name_hint')).toBe(false);
          callback.searchParams.set('client_id', 'other-client');
          expect((await fetch(callback)).status).toBe(400);
          callback.searchParams.delete('client_id');
          expect((await fetch(callback)).status).toBe(200);
        },
      },
      context.dependencies,
    );
    expect(result.ext_agent_host_id).toBe('urn:uuid:test-host');
  });

  it('handles denial without exchanging a code', async () => {
    const context = await fixture();
    await expect(
      loginWithOpenAI(
        {
          signal: context.controller.signal,
          onAuthorization: async (url) => {
            const callback = await context.receive(url);
            callback.searchParams.set('error', 'access_denied');
            expect((await fetch(callback)).status).toBe(400);
          },
        },
        context.dependencies,
      ),
    ).rejects.toMatchObject({
      message: 'Stage: Authorization callback',
      cause: { message: 'OpenAI authorization was denied or failed.' },
    });
    expect(context.calls).toHaveLength(0);
  });

  it('closes the listener when cancelled', async () => {
    const context = await fixture();
    await expect(
      loginWithOpenAI(
        {
          signal: context.controller.signal,
          onAuthorization: async (url) => {
            await context.receive(url);
            context.controller.abort();
          },
        },
        context.dependencies,
      ),
    ).rejects.toThrow();
    await expect(
      fetch(context.authorization.url!.searchParams.get('redirect_uri')!),
    ).rejects.toThrow();
  });

  it('rejects occupied ports without hanging', async () => {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      await expect(
        loginWithOpenAI({
          port: (server.address() as AddressInfo).port,
          signal: new AbortController().signal,
          onAuthorization: async () => {
            throw new Error('Must not launch browser');
          },
        }),
      ).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
