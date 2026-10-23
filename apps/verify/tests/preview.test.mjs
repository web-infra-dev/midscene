import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverPreview, samePreview } from '../src/preview.mjs';
import { registerPreview } from '../src/register-preview.mjs';
import { policy, sha } from './helpers.mjs';

function fixture() {
  const state = {
    head: sha,
    status: 'success',
    url: policy.allowedOrigins[0],
    production: false,
    deployments: [{ id: 20, sha, environment: 'Preview' }],
    calls: [],
  };
  const api = async (method, route, body) => {
    state.calls.push({ method, route, body });
    if (route === '/pulls/7')
      return { state: 'open', head: { sha: state.head } };
    if (route.startsWith('/deployments?'))
      return state.deployments.map((item) => ({
        ...item,
        production_environment: state.production,
      }));
    if (method === 'GET' && route.includes('/statuses?'))
      return [{ state: state.status, environment_url: state.url }];
    if (method === 'POST' && route === '/deployments') return { id: 21, sha };
    if (method === 'POST' && route === '/deployments/21/statuses')
      return { id: 22, ...body };
    throw new Error(`Unexpected route ${route}`);
  };
  return { state, api };
}

test('discovery requires exact SHA and environment and never falls back to an old success', async () => {
  const { state, api } = fixture();
  state.deployments.push(
    { id: 99, sha: 'b'.repeat(40), environment: 'Preview' },
    { id: 98, sha, environment: 'Production' },
    { id: 21, sha, environment: 'Preview' },
  );
  state.status = 'pending';
  const pending = await discoverPreview(api, policy, sha);
  assert.equal(pending.state, 'pending');
  assert.equal(pending.deployment.id, 21);
  assert.equal(
    state.calls.filter((call) => call.route.includes('/statuses?')).length,
    1,
  );
  state.deployments = [];
  assert.equal((await discoverPreview(api, policy, sha)).state, 'missing');
});

test('discovery blocks production, missing or unapproved URLs and exposes failed deployments', async () => {
  const { state, api } = fixture();
  for (const url of [
    '',
    'https://unapproved.example.com/',
    'http://127.0.0.1/',
    'https://user:secret@preview.example.com/',
  ]) {
    state.url = url;
    assert.equal((await discoverPreview(api, policy, sha)).state, 'blocked');
  }
  state.url = policy.allowedOrigins[0];
  state.production = true;
  assert.equal((await discoverPreview(api, policy, sha)).state, 'blocked');
  state.production = false;
  for (const status of [
    'failure',
    'inactive',
    'error',
    'queued',
    'in_progress',
  ]) {
    state.status = status;
    assert.equal((await discoverPreview(api, policy, sha)).state, status);
  }
  state.status = 'success';
  const ready = await discoverPreview(api, policy, sha);
  assert.ok(samePreview(ready, await discoverPreview(api, policy, sha)));
  assert.equal(
    samePreview(ready, { ...ready, previewUrl: `${ready.previewUrl}other` }),
    false,
  );
});

test('CI registers exact deployed SHA without merging or deactivating other PRs', async () => {
  const { state, api } = fixture();
  const result = await registerPreview({
    api,
    number: 7,
    sha,
    previewUrl: 'https://preview.example.com/',
    environment: 'Preview',
  });
  const writes = state.calls.filter((call) => call.method === 'POST');
  assert.equal(writes[0].body.ref, sha);
  assert.equal(writes[0].body.auto_merge, false);
  assert.equal(writes[0].body.production_environment, false);
  assert.deepEqual(writes[0].body.required_contexts, []);
  assert.equal(writes[1].body.auto_inactive, false);
  assert.equal(result.deploymentId, 21);
});

test('CI refuses stale heads before any write and does not mark a racing push successful', async () => {
  const { state, api } = fixture();
  const input = {
    api,
    number: 7,
    sha,
    previewUrl: 'https://preview.example.com/',
    environment: 'Preview',
  };
  state.head = 'b'.repeat(40);
  await assert.rejects(registerPreview(input), /current open PR head/);
  assert.equal(
    state.calls.some((call) => call.method === 'POST'),
    false,
  );
  state.head = sha;
  await assert.rejects(
    registerPreview({
      ...input,
      api: async (...args) => {
        const result = await api(...args);
        if (args[0] === 'POST') state.head = 'b'.repeat(40);
        return result;
      },
    }),
    /current open PR head/,
  );
  assert.equal(
    state.calls.some(
      (call) => call.method === 'POST' && call.route.includes('/statuses'),
    ),
    false,
  );
});

test('invalid CI input never reaches GitHub', async () => {
  const input = {
    api: async () => assert.fail('must not call API'),
    number: 7,
    sha,
    previewUrl: 'https://preview.example.com/',
    environment: 'Preview',
  };
  for (const override of [
    { sha: 'main' },
    { number: 0 },
    { environment: '' },
    { previewUrl: 'https://user:secret@preview.example.com/' },
    { previewUrl: 'http://localhost' },
    { previewUrl: 'https://preview.example.com/?token=secret' },
  ])
    await assert.rejects(registerPreview({ ...input, ...override }));
});
