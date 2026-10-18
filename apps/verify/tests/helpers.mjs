import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';

export const sha = 'a'.repeat(40);
export const policy = {
  repository: 'example/app',
  installationId: 12,
  environment: 'Preview',
  allowedOrigins: ['https://preview.example.com'],
  revisionPath: '/version.json',
  timeoutMs: 60_000,
  criteria: [
    {
      id: 'AC-1',
      title: 'The save action works',
      path: '/',
      steps: [
        { type: 'aiAct', prompt: 'Click Save' },
        { type: 'aiAssert', prompt: 'Saved is visible' },
      ],
    },
  ],
};
export async function temporary(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'midscene-verify-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store: new Store(root) };
}
export async function passingRunner({ directory }) {
  await writeFile(
    path.join(directory, 'AC-1.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  await writeFile(
    path.join(directory, 'AC-1.trace.json'),
    JSON.stringify({
      executions: [
        { name: 'fixture: model execution is stubbed in this test' },
      ],
    }),
  );
  return {
    status: 'completed',
    observedRevisionBefore: sha,
    observedRevisionAfter: sha,
    criteria: [
      {
        id: 'AC-1',
        status: 'passed',
        steps: [
          { type: 'aiAct', status: 'passed' },
          { type: 'aiAssert', status: 'passed' },
        ],
      },
    ],
  };
}
export function fakeGitHub() {
  const calls = [];
  const state = {
    sha,
    deploymentSha: sha,
    deployed: true,
    status: 'success',
    check: undefined,
  };
  return {
    state,
    calls,
    async api(installationId, method, route, body) {
      calls.push({ installationId, method, route, body });
      if (route.endsWith('/pulls/7'))
        return {
          state: 'open',
          draft: false,
          number: 7,
          head: { sha: state.sha },
        };
      if (route.includes('/pulls?'))
        return [{ state: 'open', number: 7, head: { sha: state.sha } }];
      if (route.includes('/check-runs?'))
        return { check_runs: state.check ? [state.check] : [] };
      if (route.endsWith('/check-runs') && method === 'POST') {
        state.check = { id: 90, ...body };
        return state.check;
      }
      if (route.endsWith('/check-runs/90')) return { id: 90, ...body };
      if (route.includes('/deployments?'))
        return state.deployed
          ? [{ id: 20, sha: state.deploymentSha, environment: 'Preview' }]
          : [];
      if (route.includes('/deployments/20/statuses?'))
        return [
          {
            state: state.status,
            environment_url: 'https://preview.example.com/',
          },
        ];
      throw new Error(`Unexpected test request: ${method} ${route}`);
    },
  };
}
export const payload = {
  action: 'opened',
  repository: { full_name: 'example/app' },
  installation: { id: 12 },
  pull_request: { number: 7 },
};
