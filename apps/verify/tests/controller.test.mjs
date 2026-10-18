import assert from 'node:assert/strict';
import test from 'node:test';
import { Controller } from '../src/controller.mjs';
import {
  fakeGitHub,
  passingRunner,
  payload,
  policy,
  sha,
  temporary,
} from './helpers.mjs';

async function setup(t, runner = passingRunner) {
  const { store } = await temporary(t);
  const github = fakeGitHub();
  const controller = new Controller({
    github,
    store,
    policies: [policy],
    runner,
    publicUrl: 'https://verify.example.com',
  });
  return { store, github, controller };
}
const conclusion = (github) =>
  github.calls.filter((item) => item.body?.conclusion).at(-1)?.body.conclusion;

test('PR -> current preview -> evidence -> successful check, duplicate event does not rerun', async (t) => {
  let executions = 0;
  const { controller, github, store } = await setup(t, async (input) => {
    executions++;
    return passingRunner(input);
  });
  await controller.handle('pull_request', payload, 'delivery-1');
  await controller.handle('pull_request', payload, 'delivery-2');
  assert.equal(executions, 1);
  assert.equal(conclusion(github), 'success');
  const [run] = await store.list('runs');
  assert.equal(run.report.subject.headSha, sha);
  assert.equal(run.report.functionalGate.status, 'satisfied');
  const publishedIndex = github.calls.findIndex(
    (item) => item.body?.conclusion === 'success',
  );
  assert.match(github.calls[publishedIndex - 1].route, /pulls\/7/);
});

test('waits for deployment and resumes on deployment_status', async (t) => {
  const { controller, github } = await setup(t);
  github.state.deployed = false;
  await controller.handle('pull_request', payload, 'delivery-1');
  assert.equal(conclusion(github), undefined);
  github.state.deployed = true;
  await controller.handle(
    'deployment_status',
    {
      ...payload,
      deployment: { sha, environment: 'Preview' },
      deployment_status: { state: 'success' },
    },
    'delivery-2',
  );
  assert.equal(conclusion(github), 'success');
  assert.equal(github.calls.filter((item) => item.method === 'POST').length, 1);
});

test('head changed during run is cancelled, not accepted', async (t) => {
  const context = await setup(t, async (input) => {
    const result = await passingRunner(input);
    context.github.state.sha = 'b'.repeat(40);
    return result;
  });
  await context.controller.handle('pull_request', payload, 'delivery');
  assert.equal(conclusion(context.github), 'cancelled');
  const [run] = await context.store.list('runs');
  assert.equal(run.report.functionalGate.status, 'not-satisfied');
});

test('runner crash completes with failure and all criteria not run', async (t) => {
  const { controller, github, store } = await setup(t, async () => {
    throw new Error('crash');
  });
  await controller.handle('pull_request', payload, 'delivery');
  assert.equal(conclusion(github), 'failure');
  assert.equal((await store.list('runs'))[0].report.coverage.notRun, 1);
});

test('installation mismatch does not access GitHub or execute', async (t) => {
  const { controller, github } = await setup(t);
  await controller.handle(
    'pull_request',
    { ...payload, installation: { id: 999 } },
    'delivery',
  );
  assert.equal(github.calls.length, 0);
});

test('explicit rerequest preserves original evidence and starts a new run', async (t) => {
  const { controller, github, store } = await setup(t);
  await controller.handle('pull_request', payload, 'delivery-1');
  const [first] = await store.list('runs');
  await controller.handle(
    'check_run',
    {
      ...payload,
      action: 'rerequested',
      check_run: {
        name: 'Midscene / Functional Verification',
        external_id: first.id,
        id: first.checkId,
      },
    },
    'delivery-2',
  );
  assert.equal((await store.list('runs')).length, 2);
  assert.equal(conclusion(github), 'success');
});

test('interrupted execution is not silently replayed after restart', async (t) => {
  let calls = 0;
  const { controller, github, store } = await setup(t, async (input) => {
    calls++;
    return passingRunner(input);
  });
  github.state.deployed = false;
  await controller.handle('pull_request', payload, 'delivery');
  const [run] = await store.list('runs');
  run.state = 'running';
  await store.put('runs', run.id, run);
  github.state.deployed = true;
  await controller.handle('pull_request', payload, 'delivery');
  assert.equal(calls, 0);
  assert.equal(conclusion(github), 'failure');
});

test('remote evidence publication must succeed before a successful check is published', async (t) => {
  let executions = 0;
  const { controller, github } = await setup(t, async (input) => {
    executions++;
    return passingRunner(input);
  });
  controller.publishEvidence = async () => {
    throw new Error('Storage unavailable');
  };
  await assert.rejects(
    controller.handle('pull_request', payload, 'publish-failure'),
    /Storage unavailable/,
  );
  assert.equal(conclusion(github), undefined);
  controller.publishEvidence = async () => {};
  await controller.handle('pull_request', payload, 'publish-recovery');
  assert.equal(conclusion(github), 'success');
  assert.equal(executions, 1);
});
