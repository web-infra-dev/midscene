import assert from 'node:assert/strict';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { finalizeHarnessRun, parseStages, resolveStages } from '../lib.mjs';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));

function reportHtml(dump) {
  const serialized = JSON.stringify(dump)
    .replaceAll('<', '__midscene_lt__')
    .replaceAll('>', '__midscene_gt__');
  return `<html><body><script>const dumpTag = '<script type="midscene_web_dump">';</script><script type="midscene_web_dump" type="application/json" data-group-id="test">${serialized}</script></body></html>`;
}

function environment(overrides = {}) {
  return {
    GITHUB_RUN_ID: '1234',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_SHA: 'abc123',
    GITHUB_WORKFLOW: 'Harness Test',
    GITHUB_JOB: 'test',
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
    MIDSCENE_MODEL_NAME: 'test-model',
    MIDSCENE_MODEL_RETRY_COUNT: '2',
    ...overrides,
  };
}

async function fixtureWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'midscene-harness-'));
  const reportDir = path.join(workspace, 'midscene_run', 'report');
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, 'case.html'),
    reportHtml({
      sdkVersion: '1.10.8',
      groupName: 'Harness fixture',
      deviceType: 'playwright',
      modelBriefs: [{ intent: 'default', name: 'test-model' }],
      executions: [
        {
          id: 'execution-1',
          name: 'assert fixture',
          tasks: [
            {
              taskId: 'task-1',
              type: 'Assert',
              status: 'finished',
              timing: { start: 10, end: 30, cost: 20 },
              usage: {
                request_id: 'request-1',
                model_name: 'test-model',
                total_tokens: 42,
              },
              log: { rawResponse: '<result>true</result>' },
              uiContext: { screenshot: { $screenshot: 'shot-1' } },
              afterScreenshot: {
                id: 'shot-file',
                storage: 'file',
                path: './screenshots/shot-file.png',
              },
            },
          ],
        },
      ],
    }),
  );
  return workspace;
}

test('parseStages rejects duplicate stage ids', () => {
  assert.throws(
    () =>
      parseStages([
        { id: 'duplicate', outcome: 'success' },
        { id: 'duplicate', outcome: 'success' },
      ]),
    /Duplicate harness stage id/,
  );
});

test('resolves a versioned suite contract from outcome-only CI input', async () => {
  const stages = await resolveStages({
    workspace: repositoryRoot,
    suite: 'android-emulator',
    outcomes: JSON.stringify({
      build: 'success',
      'package-smoke': 'success',
      'unit-tests': 'success',
      'emulator-tests': 'failure',
    }),
  });
  assert.equal(stages.length, 4);
  assert.equal(stages[3].outcome, 'failure');
  assert.deepEqual(stages[3].reportPatterns, [
    'android-emulator-smoke.html',
    'todo-mvc-android.html',
  ]);

  await assert.rejects(
    resolveStages({
      workspace: repositoryRoot,
      suite: 'android-emulator',
      outcomes: '{"build":"success"}',
    }),
    /missing \[package-smoke, unit-tests, emulator-tests\]/,
  );
});

test('validates every registered scored suite has a report Trace contract', async () => {
  const registry = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'scripts', 'ci-harness', 'suites.json'),
      'utf8',
    ),
  );
  assert.equal(Object.keys(registry).length, 15);
  for (const [suite, registeredStages] of Object.entries(registry)) {
    const outcomes = Object.fromEntries(
      registeredStages.map((stage) => [stage.id, 'success']),
    );
    const stages = await resolveStages({
      workspace: repositoryRoot,
      suite,
      outcomes: JSON.stringify(outcomes),
    });
    for (const stage of stages.filter((item) => item.kind === 'case')) {
      assert.equal(stage.traceRequired, true, `${suite}/${stage.id}`);
      assert.ok(stage.reportPatterns.length > 0, `${suite}/${stage.id}`);
    }
  }
});

test('keeps model-free desktop smokes outside Pass@k scoring', async () => {
  for (const suite of ['macos-desktop', 'windows-desktop']) {
    const stages = await resolveStages({
      workspace: repositoryRoot,
      suite,
      outcomes: JSON.stringify({
        build: 'success',
        'package-smoke': 'success',
        'unit-tests': 'success',
        'live-smoke': 'success',
        'todo-mvc': 'success',
      }),
    });
    const liveSmoke = stages.find((stage) => stage.id === 'live-smoke');
    assert.equal(liveSmoke.kind, 'check');
    assert.equal(liveSmoke.traceRequired, false);
  }
});

test('creates a trace-backed passing scorecard', async (t) => {
  const workspace = await fixtureWorkspace();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const result = await finalizeHarnessRun({
    workspace,
    suite: 'ai-web',
    stages: [
      {
        id: 'report-load',
        name: 'Report load',
        kind: 'case',
        outcome: 'success',
        traceRequired: true,
        reportPattern: 'case.html',
        validator: {
          type: 'midscene.aiAssert',
          expected: 'The report is visible',
        },
      },
    ],
    reportRoots: 'midscene_run/report',
    environment: environment(),
  });

  assert.equal(result.scorecard.verdict, 'pass');
  assert.equal(result.scorecard.traceHealth.status, 'complete');
  assert.equal(result.scorecard.cases[0].score, 1);
  assert.equal(result.scorecard.cases[0].stability, 'retry_policy_enabled');
  assert.equal(result.scorecard.cases[0].trace.tasks[0].taskId, 'task-1');
  assert.match(
    result.scorecard.cases[0].trace.tasks[0].anchor,
    /case\.html#task-task-1$/,
  );
  assert.equal(
    result.scorecard.cases[0].trace.tasks[0].evidence.rawResponse,
    true,
  );
  assert.equal(
    result.scorecard.cases[0].trace.tasks[0].modelCalls[0].requestId,
    'request-1',
  );
  const executionDump = JSON.parse(
    await readFile(
      path.join(
        result.outputDir,
        result.scorecard.cases[0].trace.tasks[0].executionDump,
      ),
      'utf8',
    ),
  );
  assert.equal(
    executionDump.executions[0].tasks[0].afterScreenshot.path,
    '../../reports/1-report/screenshots/shot-file.png',
  );

  const manifest = JSON.parse(
    await readFile(path.join(result.outputDir, 'manifest.json'), 'utf8'),
  );
  assert.ok(manifest.files.some((file) => file.path === 'scorecard.json'));
  assert.ok(
    manifest.files.some((file) => file.path.endsWith('1.execution.json')),
  );
  const traceIndex = await readFile(
    path.join(result.outputDir, 'index.html'),
    'utf8',
  );
  assert.match(traceIndex, /case\.html#task-task-1/);
  assert.match(traceIndex, /The report is visible/);
});

test('fails harness health when a scored case has no trace', async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'midscene-harness-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const result = await finalizeHarnessRun({
    workspace,
    suite: 'missing-trace',
    stages: [
      {
        id: 'ai-case',
        kind: 'case',
        outcome: 'success',
        traceRequired: true,
        reportPattern: 'missing.html',
      },
    ],
    reportRoots: 'midscene_run/report',
    environment: environment({ GITHUB_RUN_ID: '5678' }),
  });

  assert.equal(result.scorecard.cases[0].score, 1);
  assert.equal(result.scorecard.cases[0].trace.complete, false);
  assert.equal(result.scorecard.verdict, 'infra_error');
  assert.equal(result.scorecard.conclusion, 'failure');
  assert.match(result.scorecard.harnessIssues.join('\n'), /no report/);
});

test('keeps product failure separate from infrastructure failure', async (t) => {
  const workspace = await fixtureWorkspace();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const productFailure = await finalizeHarnessRun({
    workspace,
    suite: 'product-failure',
    stages: [
      {
        id: 'ai-case',
        kind: 'case',
        outcome: 'failure',
        traceRequired: true,
        reportPattern: 'case.html',
      },
    ],
    reportRoots: 'midscene_run/report',
    environment: environment({ GITHUB_RUN_ID: '9012' }),
  });
  assert.equal(productFailure.scorecard.verdict, 'fail');
  assert.equal(productFailure.scorecard.cases[0].score, 0);

  const infrastructureFailure = await finalizeHarnessRun({
    workspace,
    suite: 'infrastructure-failure',
    stages: [
      {
        id: 'device',
        kind: 'infrastructure',
        outcome: 'failure',
      },
    ],
    environment: environment({ GITHUB_RUN_ID: '3456' }),
  });
  assert.equal(infrastructureFailure.scorecard.verdict, 'infra_error');
  assert.equal(infrastructureFailure.scorecard.cases.length, 0);
});

test('removes copied evidence that contains a configured secret', async (t) => {
  const workspace = await fixtureWorkspace();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const diagnostics = path.join(workspace, 'diagnostics');
  await mkdir(diagnostics);
  await writeFile(
    path.join(diagnostics, 'leak.log'),
    'token=super-secret-value',
  );

  const result = await finalizeHarnessRun({
    workspace,
    suite: 'secret-scan',
    stages: [{ id: 'check', kind: 'check', outcome: 'success' }],
    evidenceRoots: 'diagnostics',
    environment: environment({ MIDSCENE_MODEL_API_KEY: 'super-secret-value' }),
  });
  assert.equal(result.scorecard.verdict, 'infra_error');
  assert.equal(result.scorecard.securityFindings.length, 1);
  assert.match(result.scorecard.harnessIssues[0], /Removed evidence/);
});

test('excludes hidden transient evidence from the artifact manifest', async (t) => {
  const workspace = await fixtureWorkspace();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const diagnostics = path.join(workspace, 'diagnostics');
  await mkdir(diagnostics);
  await writeFile(path.join(diagnostics, '.state.json.tmp'), 'partial');
  await writeFile(path.join(diagnostics, 'state.json'), '{"ready":true}');

  const result = await finalizeHarnessRun({
    workspace,
    suite: 'hidden-evidence',
    stages: [{ id: 'check', kind: 'check', outcome: 'success' }],
    evidenceRoots: 'diagnostics',
    environment: environment({ GITHUB_RUN_ID: '7890' }),
  });
  const manifest = JSON.parse(
    await readFile(path.join(result.outputDir, 'manifest.json'), 'utf8'),
  );
  assert.equal(
    manifest.files.some((file) => file.path.includes('.state.json.tmp')),
    false,
  );
  assert.equal(
    manifest.files.some((file) => file.path.endsWith('/state.json')),
    true,
  );
  await assert.rejects(
    access(
      path.join(
        result.outputDir,
        'evidence',
        '1-diagnostics',
        '.state.json.tmp',
      ),
    ),
  );
});
