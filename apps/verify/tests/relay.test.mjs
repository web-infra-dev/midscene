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
    REPORT_TOKEN: 't'.repeat(32),
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
  assert.equal(
    (await send(`/verifications/${'a'.repeat(64)}/verdict.json`)).status,
    401,
  );
});
