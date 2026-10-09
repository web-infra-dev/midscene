import { describe, expect, it, rs } from '@rstest/core';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { refreshOpenAICredentials } from '../../src/openai/refresh';

const saved = {
  ext_agent_host_id: 'urn:uuid:host',
  client_id: 'oaiapp_test',
  subject: 'user',
  issuer: 'https://auth.openai.com',
  access_token: 'old-access',
  refresh_token: 'old-refresh',
  id_token: 'old-id',
  scopes: ['chatgpt.tokens.use.direct'],
  expires_at: 1,
};
const response = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'openid chatgpt.tokens.use.direct',
};
async function dependencies(body: unknown, status = 200) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  return {
    privateKey,
    keys: createLocalJWKSet({
      keys: [{ ...(await exportJWK(publicKey)), kid: 'test' }],
    }),
    fetch: rs
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(body, { status })),
  };
}

describe('SIWC refresh', () => {
  it('sends only the refresh grant fields and preserves registration', async () => {
    const deps = await dependencies(response);
    const result = await refreshOpenAICredentials(
      saved,
      new AbortController().signal,
      deps,
    );
    expect(deps.fetch.mock.calls[0][0]).toBe(
      'https://auth.openai.com/api/accounts/oauth/token',
    );
    expect(
      Object.fromEntries(deps.fetch.mock.calls[0][1]!.body as URLSearchParams),
    ).toEqual({
      grant_type: 'refresh_token',
      client_id: saved.client_id,
      refresh_token: saved.refresh_token,
      resource: 'https://api.openai.com/v1',
    });
    expect(result).toMatchObject({
      ...saved,
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      scopes: ['openid', 'chatgpt.tokens.use.direct'],
      expires_at: expect.any(Number),
    });
    expect(result.expires_at).toBeGreaterThan(Date.now() + 3500000);
  });

  for (const body of [
    { ...response, refresh_token: '' },
    { ...response, expires_in: -1 },
    { ...response, scope: 'openid' },
  ]) {
    it('rejects incomplete refresh responses', async () => {
      await expect(
        refreshOpenAICredentials(
          saved,
          new AbortController().signal,
          await dependencies(body),
        ),
      ).rejects.toThrow();
    });
  }

  it('rejects invalid grants without exposing the response body', async () => {
    await expect(
      refreshOpenAICredentials(
        saved,
        new AbortController().signal,
        await dependencies({ error: 'invalid_grant', secret: 'secret' }, 400),
      ),
    ).rejects.toThrow('OpenAI refresh failed.');
  });

  for (const subject of ['user', 'other-user']) {
    it(`validates the returned ID token identity: ${subject}`, async () => {
      const deps = await dependencies(response);
      const idToken = await new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setIssuer(saved.issuer)
        .setAudience(saved.client_id)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(deps.privateKey);
      deps.fetch.mockResolvedValue(
        Response.json({ ...response, id_token: idToken }),
      );
      const result = refreshOpenAICredentials(
        saved,
        new AbortController().signal,
        deps,
      );
      if (subject === saved.subject) {
        expect((await result).id_token).toBe(idToken);
      } else {
        await expect(result).rejects.toThrow('identity');
      }
    });
  }
});
