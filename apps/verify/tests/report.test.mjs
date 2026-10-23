import assert from 'node:assert/strict';
import { readFile, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { allowedUrl, digest, validatePolicy } from '../src/config.mjs';
import { executionErrorCode } from '../src/execution-error.mjs';
import { buildReport } from '../src/report.mjs';
import { runnerEnvironment } from '../src/runner.mjs';
import { passingRunner, policy, sha, temporary } from './helpers.mjs';

async function setup(t) {
  const { root } = await temporary(t);
  return {
    id: 'f'.repeat(64),
    subject: {
      repository: policy.repository,
      headSha: sha,
      deploymentSha: sha,
    },
    policy,
    execution: await passingRunner({ directory: root }),
    directory: root,
    currentHead: sha,
  };
}

test('report, Markdown, HTML and manifest share the same criterion results', async (t) => {
  const input = await setup(t);
  const report = await buildReport(input);
  assert.equal(report.functionalGate.status, 'satisfied');
  assert.deepEqual(report.coverage, {
    required: 1,
    passed: 1,
    failed: 0,
    notRun: 0,
  });
  const manifest = JSON.parse(
    await readFile(path.join(input.directory, 'manifest.json')),
  );
  for (const file of manifest.files)
    assert.equal(
      digest(await readFile(path.join(input.directory, file.path))),
      file.digest,
    );
  assert.match(
    await readFile(path.join(input.directory, 'summary.md'), 'utf8'),
    /AC-1: passed/,
  );
  assert.match(
    await readFile(path.join(input.directory, 'report.html'), 'utf8'),
    /AC-1: passed/,
  );
  assert.match(
    await readFile(path.join(input.directory, 'report.html'), 'utf8'),
    /href="AC-1.midscene.html"/,
  );
  assert.ok(manifest.files.some((file) => file.path === 'AC-1.midscene.html'));
});

test('model denial is an execution error, not a failed product assertion', async (t) => {
  const error = new Error('Assertion failed', {
    cause: new Error('failed to call AI model service: 403 Access denied'),
  });
  assert.equal(executionErrorCode(error), 'MODEL_SERVICE_ERROR');
  assert.equal(
    executionErrorCode(new Error('Assertion failed: Saved is not visible')),
    'STEP_EXECUTION_FAILED',
  );
  const input = await setup(t);
  input.execution.status = 'error';
  input.execution.errorCode = executionErrorCode(error);
  input.execution.criteria[0].status = 'not-run';
  input.execution.criteria[0].errorCode = executionErrorCode(error);
  const report = await buildReport(input);
  assert.equal(report.execution.errorCode, 'MODEL_SERVICE_ERROR');
  assert.equal(report.coverage.failed, 0);
  assert.equal(report.coverage.notRun, 1);
  assert.equal(report.functionalGate.status, 'not-satisfied');
});

for (const [name, change, code] of [
  [
    'old commit',
    (input) => {
      input.currentHead = 'b'.repeat(40);
    },
    'STALE_REVISION',
  ],
  [
    'wrong deployment',
    (input) => {
      input.subject.deploymentSha = 'b'.repeat(40);
    },
    'DEPLOYMENT_REVISION_MISMATCH',
  ],
  [
    'old preview page',
    (input) => {
      input.execution.observedRevisionBefore = 'b'.repeat(40);
    },
    'OBSERVED_REVISION_MISMATCH',
  ],
  [
    'preview changes during execution',
    (input) => {
      input.execution.observedRevisionAfter = 'b'.repeat(40);
    },
    'OBSERVED_REVISION_MISMATCH',
  ],
  [
    'timeout',
    (input) => {
      input.execution.status = 'timed-out';
    },
    'EXECUTION_INCOMPLETE',
  ],
  [
    'missing required criterion',
    (input) => {
      input.execution.criteria = [];
    },
    'CRITERION_NOT_RUN',
  ],
  [
    'duplicate criterion',
    (input) => {
      input.execution.criteria.push(input.execution.criteria[0]);
    },
    'DUPLICATE_CRITERION',
  ],
  [
    'runner declares pass without assertion',
    (input) => {
      input.execution.criteria[0].steps.pop();
    },
    'ASSERTION_NOT_COMPLETED',
  ],
  [
    'failed assertion',
    (input) => {
      input.execution.criteria[0].status = 'failed';
    },
    'CRITERION_FAILED',
  ],
]) {
  test(`rejects ${name}`, async (t) => {
    const input = await setup(t);
    change(input);
    const report = await buildReport(input);
    assert.equal(report.functionalGate.status, 'not-satisfied');
    assert.ok(
      report.functionalGate.blockingReasons.some((item) => item.code === code),
    );
  });
}

test('missing or symlinked evidence cannot pass', async (t) => {
  const input = await setup(t);
  await unlink(path.join(input.directory, 'AC-1.png'));
  await symlink('AC-1.trace.json', path.join(input.directory, 'AC-1.png'));
  const report = await buildReport(input);
  assert.equal(report.functionalGate.status, 'not-satisfied');
  assert.ok(
    report.functionalGate.blockingReasons.some(
      (item) => item.code === 'EVIDENCE_MISSING',
    ),
  );
});

test('policy forbids empty acceptance and action-only success; URL allowlist is exact', () => {
  validatePolicy(policy);
  assert.throws(() =>
    validatePolicy({
      ...policy,
      criteria: [policy.criteria[0], { ...policy.criteria[0], id: 'ac-1' }],
    }),
  );
  assert.throws(() => validatePolicy({ ...policy, criteria: [] }));
  assert.throws(() =>
    validatePolicy({
      ...policy,
      criteria: [
        { ...policy.criteria[0], steps: [{ type: 'aiAct', prompt: 'Do it' }] },
      ],
    }),
  );
  assert.throws(() =>
    allowedUrl('https://preview.example.com.attacker.test', policy),
  );
  assert.throws(() =>
    allowedUrl('https://user:password@preview.example.com', policy),
  );
  assert.throws(() => allowedUrl('http://127.0.0.1:9000', policy));
});

test('worker environment excludes App keys, shared report credentials and unrelated secrets', () => {
  assert.deepEqual(
    runnerEnvironment({
      PATH: '/bin',
      MIDSCENE_MODEL_API_KEY: 'model',
      GITHUB_APP_PRIVATE_KEY_FILE: 'secret.pem',
      VERIFY_REPORT_TOKEN: 'secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
      NODE_OPTIONS: '--require=evil',
    }),
    { PATH: '/bin', MIDSCENE_MODEL_API_KEY: 'model' },
  );
});

test('worker inherits the shared AI CI connection policy without arbitrary Node flags', () => {
  assert.deepEqual(
    runnerEnvironment({
      NODE_OPTIONS:
        '--require=evil --network-family-autoselection-attempt-timeout=2000',
    }),
    { NODE_OPTIONS: '--network-family-autoselection-attempt-timeout=2000' },
  );
});

test('missing native HTML report blocks acceptance', async (t) => {
  const input = await setup(t);
  await unlink(path.join(input.directory, 'AC-1.midscene.html'));
  const report = await buildReport(input);
  assert.equal(report.functionalGate.status, 'not-satisfied');
  assert.ok(
    report.functionalGate.blockingReasons.some(
      (reason) => reason.code === 'EVIDENCE_MISSING',
    ),
  );
});
