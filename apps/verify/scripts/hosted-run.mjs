import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { policyDigest, validatePolicy } from '../src/config.mjs';
import { Controller } from '../src/controller.mjs';
import { GitHub } from '../src/github.mjs';
import { inspectBundle } from '../src/inspect.mjs';
import { runBrowser } from '../src/runner.mjs';
import { createQueue, createVerifyServer } from '../src/server.mjs';
import { Store } from '../src/store.mjs';

const required = (name) => {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
  return process.env[name];
};
const origin = new URL(required('VERIFY_PUBLIC_URL'));
if (origin.protocol !== 'https:' || origin.pathname !== '/')
  throw new Error('Expected HTTPS origin');
const relayToken = required('VERIFY_RELAY_TOKEN');
async function remote(route, options = {}) {
  const response = await fetch(new URL(route, origin), {
    ...options,
    headers: { authorization: `Bearer ${relayToken}`, ...options.headers },
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Evidence service HTTP ${response.status}`);
  return response;
}
class HostedStore extends Store {
  async get(collection, id) {
    this.file(collection, id);
    return (await remote(`/state/${collection}/${id}`)).json();
  }
  async put(collection, id, value) {
    this.file(collection, id);
    await remote(`/state/${collection}/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
  }
  async list(collection) {
    this.file(collection, 'validation');
    return (await remote(`/state/${collection}`)).json();
  }
}
const policies = JSON.parse(
  await readFile(required('VERIFY_CONFIG'), 'utf8'),
).repositories.map(validatePolicy);
const store = new HostedStore(path.resolve(required('VERIFY_DATA_DIR')));
const github = new GitHub({
  appId: required('GITHUB_APP_ID'),
  privateKey: required('GITHUB_APP_PRIVATE_KEY'),
});
const controller = new Controller({
  github,
  store,
  policies,
  runner: runBrowser,
  publicUrl: origin.origin,
  workflowUrl:
    process.env.GITHUB_RUN_ID &&
    /^\d+$/.test(process.env.GITHUB_RUN_ID) &&
    /^[\w.-]+\/[\w.-]+$/.test(process.env.GITHUB_REPOSITORY ?? '')
      ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : undefined,
  async publishEvidence({ id, directory, report }) {
    let manifest;
    try {
      manifest = JSON.parse(
        await readFile(path.join(directory, 'manifest.json'), 'utf8'),
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // A prior process may have uploaded evidence before publication was interrupted.
      manifest = await (
        await remote(`/verifications/${id}/manifest.json`)
      ).json();
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, 'manifest.json'),
        JSON.stringify(manifest),
      );
      for (const entry of manifest.files) {
        if (!/^[\w.-]+$/.test(entry.path))
          throw new Error('Invalid manifest path');
        await writeFile(
          path.join(directory, entry.path),
          Buffer.from(
            await (
              await remote(`/verifications/${id}/${entry.path}`)
            ).arrayBuffer(),
          ),
        );
      }
    }
    const policy = policies.find(
      (item) => item.repository === report.subject.repository,
    );
    await inspectBundle(directory, {
      headSha: report.subject.headSha,
      expectedPolicyDigest: policyDigest(policy),
    });
    for (const name of [
      ...manifest.files.map((entry) => entry.path),
      'manifest.json',
    ]) {
      if (!/^[\w.-]+$/.test(name)) throw new Error('Invalid evidence path');
      const type = name.endsWith('.html')
        ? 'text/html'
        : name.endsWith('.png')
          ? 'image/png'
          : name.endsWith('.json')
            ? 'application/json'
            : 'text/plain';
      await remote(`/verifications/${id}/${name}`, {
        method: 'PUT',
        headers: { 'content-type': type },
        body: await readFile(path.join(directory, name)),
      });
    }
    console.log(
      JSON.stringify({
        publishedEvidence: id,
        headSha: report.subject.headSha,
      }),
    );
  },
});
const queue = createQueue({
  store,
  controller,
  onError: (id, state) =>
    console.error(JSON.stringify({ delivery: id, state })),
});
const server = createVerifyServer({
  store,
  webhookSecret: required('GITHUB_WEBHOOK_SECRET'),
  onQueued: () => {},
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  // Event workflows can start before GitHub's independently delivered webhook arrives.
  for (let attempt = 0; attempt < 12; attempt++) {
    const deliveries = await (await remote('/deliveries')).json();
    for (const key of deliveries) {
      if (!/^delivery\/[\w-]+$/.test(key))
        throw new Error('Invalid delivery key');
      const delivery = await (await remote(`/${key}`)).json();
      const response = await fetch(
        `http://127.0.0.1:${server.address().port}/webhooks/github`,
        { method: 'POST', headers: delivery.headers, body: delivery.body },
      );
      if (response.status !== 202)
        throw new Error(`Local webhook HTTP ${response.status}`);
      await remote(`/${key}`, { method: 'DELETE' });
      console.log(
        JSON.stringify({
          received: delivery.headers['x-github-event'],
          delivery: delivery.headers['x-github-delivery'],
        }),
      );
    }
    await queue.wake();
    if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  const failed = (await store.list('deliveries')).filter(
    (item) => item.state === 'failed',
  );
  if (failed.length)
    throw new Error(
      `${failed.length} delivery failures require operator attention`,
    );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
