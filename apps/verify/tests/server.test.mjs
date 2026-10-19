import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { Controller } from '../src/controller.mjs';
import { GitHub, appJwt, verifyWebhook } from '../src/github.mjs';
import { createQueue, createVerifyServer } from '../src/server.mjs';
import {
  fakeGitHub,
  passingRunner,
  payload,
  policy,
  temporary,
} from './helpers.mjs';

test('webhook verification matches the official GitHub vector and rejects tampering', () => {
  const signature =
    'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';
  assert.equal(
    verifyWebhook(
      Buffer.from('Hello, World!'),
      signature,
      "It's a Secret to Everybody",
    ),
    true,
  );
  assert.equal(
    verifyWebhook(
      Buffer.from('Hello, world!'),
      signature,
      "It's a Secret to Everybody",
    ),
    false,
  );
  assert.equal(
    verifyWebhook(Buffer.from('Hello, World!'), 'sha256=123', 'secret'),
    false,
  );
});

test('App JWT is RS256 signed and valid for less than ten minutes', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const token = appJwt(123, privateKey, 1_000_000);
  const [header, body, signature] = token.split('.');
  assert.equal(
    verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${body}`),
      publicKey,
      Buffer.from(signature, 'base64url'),
    ),
    true,
  );
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url')), {
    iat: 940,
    exp: 1540,
    iss: '123',
  });
});

test('GitHub client exchanges installation tokens and reuses them without leaking API error bodies', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const requests = [];
  const github = new GitHub({
    appId: 1,
    privateKey,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/access_tokens'))
        return Response.json({
          token: 'installation-token',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        });
      return Response.json({ secret: 'must-not-appear' }, { status: 403 });
    },
  });
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      github.api(12, 'GET', '/repos/example/app/pulls/7'),
      /^Error: GitHub API request failed \(403\)$/,
    );
  assert.equal(
    requests.filter((item) => item.url.endsWith('/access_tokens')).length,
    1,
  );
  assert.equal(
    requests[1].options.headers.authorization,
    'Bearer installation-token',
  );
});

test('HTTP webhook -> durable queue -> controller -> public read-only evidence delivery', async (t) => {
  const { store } = await temporary(t);
  const github = fakeGitHub();
  const controller = new Controller({
    github,
    store,
    policies: [policy],
    runner: passingRunner,
    publicUrl: 'https://verify.example.com',
  });
  const queue = createQueue({ store, controller });
  const secret = 's'.repeat(32);
  const server = createVerifyServer({
    store,
    webhookSecret: secret,
    onQueued: () => {},
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify(payload);
  const headers = {
    'x-github-event': 'pull_request',
    'x-github-delivery': 'delivery-1',
    'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
  };
  assert.equal(
    (
      await fetch(`${base}/webhooks/github`, {
        method: 'POST',
        headers: { ...headers, 'x-hub-signature-256': 'bad' },
        body,
      })
    ).status,
    401,
  );
  assert.equal((await store.list('deliveries')).length, 0);
  assert.equal(
    (await fetch(`${base}/webhooks/github`, { method: 'POST', headers, body }))
      .status,
    202,
  );
  assert.equal((await store.get('deliveries', 'delivery-1')).state, 'pending');
  await queue.wake();
  const [run] = await store.list('runs');
  assert.equal(run.report.functionalGate.status, 'satisfied');
  const url = `${base}/verifications/${run.id}/verdict.json`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('www-authenticate'), null);
  assert.equal((await response.json()).verificationId, run.id);
  const html = await fetch(`${base}/verifications/${run.id}/report.html`);
  assert.equal(html.status, 200);
  assert.match(
    html.headers.get('content-security-policy'),
    /default-src 'none'/,
  );
  assert.equal(
    (await fetch(`${base}/verifications/${run.id}/service.lock`)).status,
    404,
  );
  for (const name of [
    'manifest.json',
    'AC-1.png',
    'AC-1.trace.json',
    'AC-1.midscene.html',
  ]) {
    assert.equal(
      (await fetch(`${base}/verifications/${run.id}/${name}`)).status,
      200,
    );
  }
  const native = await fetch(
    `${base}/verifications/${run.id}/AC-1.midscene.html`,
  );
  assert.match(
    native.headers.get('content-security-policy'),
    /script-src 'unsafe-inline'/,
  );
  assert.ok(
    !html.headers.get('content-security-policy').includes('script-src'),
  );
  assert.equal((await fetch(url, { method: 'PUT', body: '{}' })).status, 404);
  await fetch(`${base}/webhooks/github`, { method: 'POST', headers, body });
  await queue.wake();
  assert.equal((await store.list('runs')).length, 1);
});

test('failed deliveries are durable and retry at most three times', async (t) => {
  const { store } = await temporary(t);
  await store.put('deliveries', 'one', {
    id: 'one',
    state: 'pending',
    attempts: 0,
  });
  let attempts = 0;
  const queue = createQueue({
    store,
    controller: {
      async handle() {
        attempts++;
        throw new Error('network unavailable');
      },
    },
  });
  await queue.wake();
  await queue.wake();
  await queue.wake();
  await queue.wake();
  assert.equal(attempts, 3);
  assert.equal((await store.get('deliveries', 'one')).state, 'failed');
});
