import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { handleRelay } from '../deploy/relay-handler.mjs';

test('hosted relay validates signatures and protects durable state', async () => {
  const map = new Map();
  const storage = {
    put: async (k, v) => map.set(k, v),
    get: async (k) => map.get(k),
    delete: async (k) => map.delete(k),
    list: async ({ prefix }) =>
      new Map([...map].filter(([k]) => k.startsWith(prefix))),
  };
  const env = {
    WEBHOOK_SECRET: 's'.repeat(32),
    RELAY_TOKEN: 'r'.repeat(32),
  };
  const send = (p, options = {}) =>
    handleRelay(
      new Request(`https://verify.example.com${p}`, options),
      env,
      storage,
    );
  assert.equal(
    (await send('/webhooks/github', { method: 'POST', body: '{}' })).status,
    401,
  );
  assert.equal(map.size, 0);
  const body = '{"action":"opened"}';
  const signature = `sha256=${createHmac('sha256', env.WEBHOOK_SECRET).update(body).digest('hex')}`;
  assert.equal(
    (
      await send('/webhooks/github', {
        method: 'POST',
        body,
        headers: {
          'x-hub-signature-256': signature,
          'x-github-delivery': 'test-delivery',
          'x-github-event': 'pull_request',
        },
      })
    ).status,
    202,
  );
  const headers = {
    authorization: `Bearer ${env.RELAY_TOKEN}`,
    'content-type': 'application/json',
  };
  assert.deepEqual(await (await send('/deliveries', { headers })).json(), [
    'delivery/test-delivery',
  ]);
  assert.equal(
    (await send('/state/runs/a', { method: 'PUT', body: '{}' })).status,
    404,
  );
  await send('/state/runs/a', {
    method: 'PUT',
    headers,
    body: '{"state":"running"}',
  });
  assert.deepEqual(await (await send('/state/runs/a', { headers })).json(), {
    state: 'running',
  });
  assert.deepEqual(await (await send('/state/runs', { headers })).json(), [
    { state: 'running' },
  ]);
  await send('/delivery/test-delivery', { method: 'DELETE', headers });
  assert.deepEqual(await (await send('/deliveries', { headers })).json(), []);
});

test('hosted reports are public read-only while uploads and state remain protected', async () => {
  const files = new Map();
  const env = {
    WEBHOOK_SECRET: 's'.repeat(32),
    RELAY_TOKEN: 'r'.repeat(32),
    DATA: {
      async put(key, value, options) {
        files.set(key, { value, metadata: options.metadata });
      },
      async getWithMetadata(key) {
        return files.get(key) ?? { value: null };
      },
    },
  };
  const storage = { list: async () => new Map() };
  const send = (path, options = {}) =>
    handleRelay(
      new Request(`https://verify.example.com${path}`, options),
      env,
      storage,
    );
  const prefix = `/verifications/${'a'.repeat(64)}`;
  for (const [name, type, body] of [
    ['report.html', 'text/html', '<h1>Passed</h1>'],
    ['verdict.json', 'application/json', '{"result":"passed"}'],
    ['AC-1.png', 'image/png', 'screenshot'],
  ]) {
    const path = `${prefix}/${name}`;
    assert.equal((await send(path, { method: 'PUT', body })).status, 405);
    assert.equal((await send(path)).status, 404);
    assert.equal(
      (
        await send(path, {
          method: 'PUT',
          body,
          headers: {
            authorization: `Bearer ${env.RELAY_TOKEN}`,
            'content-type': type,
          },
        })
      ).status,
      200,
    );
    const response = await send(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('www-authenticate'), null);
    assert.equal(response.headers.get('content-type'), type);
    assert.equal(await response.text(), body);
    assert.equal((await send(path, { method: 'DELETE' })).status, 405);
  }
  assert.equal((await send('/state/runs')).status, 404);
  assert.equal((await send('/deliveries')).status, 404);
  const html = await send(`${prefix}/report.html`);
  assert.match(
    html.headers.get('content-security-policy'),
    /default-src 'none'/,
  );
});
