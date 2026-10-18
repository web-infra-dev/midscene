import { createHmac, sign, timingSafeEqual } from 'node:crypto';

export function verifyWebhook(body, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature ?? '')) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function appJwt(appId, privateKey, now = Date.now()) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const seconds = Math.floor(now / 1000);
  const data = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iat: seconds - 60,
    exp: seconds + 540,
    iss: String(appId),
  })}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
}

export class GitHub {
  constructor({ appId, privateKey, fetchImpl = fetch }) {
    this.appId = appId;
    this.privateKey = privateKey;
    this.fetch = fetchImpl;
    this.tokens = new Map();
  }

  async request(token, method, path, body) {
    const response = await this.fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'midscene-verify',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
      redirect: 'error',
    });
    if (!response.ok) {
      // Never include response bodies, tokens, or private repository URLs in logs.
      throw new Error(`GitHub API request failed (${response.status})`);
    }
    return response.status === 204 ? undefined : response.json();
  }

  async api(installationId, method, path, body) {
    let cached = this.tokens.get(installationId);
    if (!cached || cached.expiresAt < Date.now() + 60_000) {
      const result = await this.request(
        appJwt(this.appId, this.privateKey),
        'POST',
        `/app/installations/${installationId}/access_tokens`,
      );
      cached = {
        token: result.token,
        expiresAt: Date.parse(result.expires_at),
      };
      this.tokens.set(installationId, cached);
    }
    return this.request(cached.token, method, path, body);
  }
}
