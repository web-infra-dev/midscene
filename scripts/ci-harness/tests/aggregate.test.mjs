import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const aggregateScript = fileURLToPath(new URL('../aggregate.mjs', import.meta.url));

function runAggregate(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [aggregateScript], {
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('aggregates suite scorecards and reports missing suites', async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'midscene-aggregate-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const inputDir = path.join(workspace, 'midscene_run', 'nightly-input');
  await mkdir(path.join(inputDir, 'harness-suite-a'), { recursive: true });
  await writeFile(
    path.join(inputDir, 'harness-suite-a', 'scorecard.json'),
    JSON.stringify({
      suite: 'suite-a',
      verdict: 'pass',
      traceHealth: { status: 'complete', taskCount: 3 },
      cases: [{ score: 1 }],
    }),
  );
  const githubOutput = path.join(workspace, 'github-output.txt');
  const githubSummary = path.join(workspace, 'github-summary.md');

  const execution = await runAggregate({
    GITHUB_WORKSPACE: workspace,
    GITHUB_OUTPUT: githubOutput,
    GITHUB_STEP_SUMMARY: githubSummary,
    HARNESS_EXPECTED_SUITES: '["suite-a","suite-b"]',
  });
  assert.equal(execution.code, 0, execution.stderr);

  const aggregate = JSON.parse(
    await readFile(
      path.join(
        workspace,
        'midscene_run',
        'nightly-aggregate',
        'aggregate-scorecard.json',
      ),
      'utf8',
    ),
  );
  assert.equal(aggregate.verdict, 'infra_error');
  assert.deepEqual(aggregate.issues, ['Missing suite: suite-b']);
  assert.equal(aggregate.totals.passed, 1);
  assert.match(await readFile(githubOutput, 'utf8'), /conclusion=failure/);
  assert.match(await readFile(githubSummary, 'utf8'), /Missing suite: suite-b/);
});
