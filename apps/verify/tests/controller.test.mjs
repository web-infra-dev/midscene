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
  assert.equal(
    github.calls.filter(
      (item) => item.method === 'POST' && item.route.endsWith('/check-runs'),
    ).length,
    1,
  );
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

test('runner crash is inconclusive with all criteria not run', async (t) => {
  const { controller, github, store } = await setup(t, async () => {
    throw new Error('crash');
  });
  await controller.handle('pull_request', payload, 'delivery');
  assert.equal(conclusion(github), 'action_required');
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
  assert.equal(conclusion(github), 'action_required');
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

test('publishes one App comment per verification with human and Agent results', async (t) => {
  const { controller, github, store } = await setup(t);
  controller.workflowUrl = 'https://github.com/example/app/actions/runs/123';
  await controller.handle('pull_request', payload, 'first');
  await controller.handle('pull_request', payload, 'duplicate');
  assert.equal(github.state.comments.length, 1);
  const [run] = await store.list('runs');
  assert.equal(run.commentId, github.state.comments[0].id);
  const body = github.state.comments[0].body;
  assert.match(body, /Midscene Verify: Passed/);
  assert.ok(body.includes(sha));
  assert.match(body, /HTML report/);
  assert.match(body, /actions\/runs\/123/);
  const summary = JSON.parse(body.match(/```json\n([\s\S]*?)\n```/)[1]);
  assert.equal(summary.conclusion, 'success');
  assert.equal(summary.headSha, sha);
  assert.equal(summary.policyDigest, run.report.policyDigest);
  assert.equal(summary.coverage.passed, 1);
  assert.equal(summary.midsceneReportUrls.length, 1);
  assert.match(summary.midsceneReportUrls[0], /AC-1.midscene.html$/);
  assert.match(body, /Open Midscene HTML report/);
});

test('comment permission failure retries publication without rerunning browser actions', async (t) => {
  let executions = 0;
  const { controller, github } = await setup(t, async (input) => {
    executions++;
    return passingRunner(input);
  });
  const api = github.api.bind(github);
  github.api = async (...args) => {
    if (args[1] === 'POST' && args[2].endsWith('/comments'))
      throw new Error('GitHub API request failed (403)');
    return api(...args);
  };
  await assert.rejects(
    controller.handle('pull_request', payload, 'denied'),
    /403/,
  );
  github.api = api;
  await controller.handle('pull_request', payload, 'recovered');
  assert.equal(executions, 1);
  assert.equal(github.state.comments.length, 1);
});

test('recovers remote comment after state-write crash and ignores copied markers across pages', async (t) => {
  let executions = 0;
  const { controller, github, store } = await setup(t, async (input) => {
    executions++;
    return passingRunner(input);
  });
  const put = store.put.bind(store);
  store.put = async (collection, id, value) => {
    if (collection === 'runs' && value.state === 'completed')
      throw new Error('Simulated state-write crash');
    return put(collection, id, value);
  };
  await assert.rejects(
    controller.handle('pull_request', payload, 'crash'),
    /state-write/,
  );
  const realComment = github.state.comments[0];
  github.state.comments = [
    ...Array.from({ length: 100 }, (_, i) => ({
      id: i,
      body: realComment.body,
      performed_via_github_app: null,
    })),
    realComment,
  ];
  store.put = put;
  await controller.handle('pull_request', payload, 'recover');
  assert.equal(executions, 1);
  assert.equal(github.state.comments.length, 101);
  assert.equal((await store.list('runs'))[0].commentId, realComment.id);
});

test('incomplete and superseded results are labeled honestly in App comments', async (t) => {
  const failed = await setup(t, async () => {
    throw new Error('Runner crash');
  });
  await failed.controller.handle('pull_request', payload, 'failed');
  assert.match(
    failed.github.state.comments[0].body,
    /Midscene Verify: Inconclusive/,
  );
  assert.match(
    failed.github.state.comments[0].body,
    /Execution: \*\*error\*\*/,
  );
  const stale = await setup(t, async (input) => {
    const result = await passingRunner(input);
    stale.github.state.sha = 'b'.repeat(40);
    return result;
  });
  await stale.controller.handle('pull_request', payload, 'stale');
  assert.match(
    stale.github.state.comments[0].body,
    /Midscene Verify: Superseded/,
  );
  assert.match(
    stale.github.state.comments[0].body,
    /does not verify the current PR head/,
  );
});

test('failed deployment events update waiting feedback without browser execution', async (t) => {
  const { controller, github, store } = await setup(t, async () =>
    assert.fail('must wait'),
  );
  github.state.status = 'failure';
  await controller.handle(
    'deployment_status',
    {
      ...payload,
      deployment: { sha, environment: 'Preview' },
      deployment_status: { state: 'failure' },
    },
    'failed-deployment',
  );
  assert.equal((await store.list('runs'))[0].discovery.state, 'failure');
  assert.match(
    github.calls.at(-1).body.output.summary,
    /Latest deployment status: failure/,
  );
});

test('new PR head cancels a queued check for the old revision', async (t) => {
  const { controller, github, store } = await setup(t, async () =>
    assert.fail('must wait'),
  );
  github.state.deployed = false;
  await controller.handle('pull_request', payload, 'old');
  github.state.sha = 'b'.repeat(40);
  await controller.handle('pull_request', payload, 'new');
  const runs = await store.list('runs');
  assert.equal(
    runs.find((run) => run.subject.headSha === sha).state,
    'superseded',
  );
  assert.equal(runs.find((run) => run.subject.headSha !== sha).state, 'queued');
  assert.ok(github.calls.some((call) => call.body?.conclusion === 'cancelled'));
});

test('a newer deployment during execution invalidates the original preview', async (t) => {
  const context = await setup(t, async (input) => {
    const result = await passingRunner(input);
    const api = context.github.api.bind(context.github);
    context.github.api = async (...args) =>
      args[2].includes('/deployments?')
        ? [{ id: 21, sha, environment: 'Preview' }]
        : args[2].includes('/deployments/21/statuses?')
          ? [{ state: 'pending' }]
          : api(...args);
    return result;
  });
  await context.controller.handle('pull_request', payload, 'replacement');
  assert.equal(conclusion(context.github), 'cancelled');
  const [run] = await context.store.list('runs');
  assert.equal(run.report.execution.status, 'deployment-changed');
  assert.equal(run.report.subject.deploymentId, 20);
});

test('publication recovery retains original deployment evidence and cancels changed preview', async (t) => {
  let executions = 0;
  const { controller, github, store } = await setup(t, async (input) => {
    executions++;
    return passingRunner(input);
  });
  controller.publishEvidence = async () => {
    throw new Error('upload unavailable');
  };
  await assert.rejects(
    controller.handle('pull_request', payload, 'first'),
    /upload/,
  );
  github.state.status = 'inactive';
  controller.publishEvidence = async () => {};
  await controller.handle('pull_request', payload, 'recovery');
  assert.equal(executions, 1);
  assert.equal(conclusion(github), 'cancelled');
  assert.equal((await store.list('runs'))[0].report.subject.deploymentId, 20);
});

test('CI registration resumes the waiting App check and only the App posts verification', async (t) => {
  const { registerPreview } = await import('../src/register-preview.mjs');
  let executions = 0;
  const { controller, github } = await setup(t, async (input) => {
    executions++;
    return passingRunner(input);
  });
  github.state.deployed = false;
  await controller.handle('pull_request', payload, 'waiting');
  const api = github.api.bind(github);
  github.api = async (installation, method, route, body) => {
    if (method === 'POST' && route.endsWith('/deployments')) {
      github.state.deployed = true;
      github.state.status = 'pending';
      return { id: 20, sha };
    }
    if (method === 'POST' && route.endsWith('/deployments/20/statuses')) {
      github.state.status = body.state;
      return { id: 30, ...body };
    }
    return api(installation, method, route, body);
  };
  await registerPreview({
    api: (method, suffix, body) =>
      github.api(
        policy.installationId,
        method,
        `/repos/${policy.repository}${suffix}`,
        body,
      ),
    number: 7,
    sha,
    previewUrl: 'https://preview.example.com/',
    environment: 'Preview',
  });
  assert.equal(executions, 0);
  assert.equal(github.state.comments.length, 0);
  await controller.handle(
    'deployment_status',
    {
      ...payload,
      deployment: { sha, environment: 'Preview' },
      deployment_status: { state: 'success' },
    },
    'registered',
  );
  assert.equal(executions, 1);
  assert.equal(conclusion(github), 'success');
  assert.equal(github.state.comments.length, 1);
});
