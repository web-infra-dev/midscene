import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { requireValue, validatePolicy } from './config.mjs';
import { Controller } from './controller.mjs';
import { GitHub } from './github.mjs';
import { runBrowser } from './runner.mjs';
import { createQueue, createVerifyServer } from './server.mjs';
import { Store } from './store.mjs';

const required = (name) => {
  requireValue(process.env[name], `Missing ${name}`);
  return process.env[name];
};
const policies = JSON.parse(
  await readFile(required('VERIFY_CONFIG'), 'utf8'),
).repositories.map(validatePolicy);
requireValue(
  new Set(policies.map((item) => item.repository)).size === policies.length,
  'Duplicate repository policies',
);
const publicUrl = new URL(required('VERIFY_PUBLIC_URL'));
requireValue(
  publicUrl.protocol === 'https:' &&
    publicUrl.pathname === '/' &&
    !publicUrl.search &&
    !publicUrl.hash &&
    !publicUrl.username &&
    !publicUrl.password,
  'VERIFY_PUBLIC_URL must be a plain HTTPS origin',
);
const webhookSecret = required('GITHUB_WEBHOOK_SECRET');
requireValue(
  webhookSecret.length >= 32,
  'Use a Webhook secret of at least 32 characters',
);
const github = new GitHub({
  appId: required('GITHUB_APP_ID'),
  privateKey: await readFile(required('GITHUB_APP_PRIVATE_KEY_FILE'), 'utf8'),
});
const root = path.resolve(required('VERIFY_DATA_DIR'));
await mkdir(root, { recursive: true, mode: 0o700 });
// Explicit single-process deployment. Never steal a lock from another instance.
const lockPath = path.join(root, 'service.lock');
const lock = await open(lockPath, 'wx', 0o600);
await lock.writeFile(String(process.pid));
const store = new Store(root);
const controller = new Controller({
  github,
  store,
  policies,
  runner: runBrowser,
  publicUrl: publicUrl.origin,
});
const queue = createQueue({
  store,
  controller,
  onError: (id, state) =>
    console.error(`Verification delivery ${id}: ${state}`),
});
const server = createVerifyServer({
  store,
  webhookSecret,
  onQueued: () => void queue.wake(),
});
server.requestTimeout = 30_000;
server.listen(
  Number(process.env.PORT ?? 4319),
  process.env.HOST ?? '127.0.0.1',
);
const timer = setInterval(() => void queue.wake(), 30_000);
void queue.wake();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  server.close();
  await queue.wake();
  await lock.close();
  await unlink(lockPath);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
