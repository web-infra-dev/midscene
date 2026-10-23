import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { policyDigest } from '../src/config.mjs';
import { inspectBundle } from '../src/inspect.mjs';
import { buildReport } from '../src/report.mjs';
import { runBrowser } from '../src/runner.mjs';

// Opt-in real-model test. No fabricated success fallback; missing credentials fail.
if (process.env.VERIFY_MODEL_ENV_FILE) {
  for (const [key, value] of Object.entries(
    parseEnv(await readFile(process.env.VERIFY_MODEL_ENV_FILE, 'utf8')),
  )) {
    process.env[key] ??= value;
  }
}
if (process.env.OPENAI_API_KEY)
  process.env.MIDSCENE_MODEL_API_KEY ??= process.env.OPENAI_API_KEY;
if (process.env.OPENAI_BASE_URL)
  process.env.MIDSCENE_MODEL_BASE_URL ??= process.env.OPENAI_BASE_URL;
if (process.env.MIDSCENE_USE_QWEN_VL && !process.env.MIDSCENE_MODEL_FAMILY)
  process.env.MIDSCENE_MODEL_FAMILY = 'qwen2.5-vl';
if (!process.env.MIDSCENE_MODEL_API_KEY || !process.env.MIDSCENE_MODEL_NAME)
  throw new Error(
    'Set MIDSCENE_MODEL_API_KEY and MIDSCENE_MODEL_NAME for the real-model smoke test',
  );

const sha = 'a'.repeat(40);
const server = createServer((req, res) => {
  if (req.url === '/version.json') {
    res
      .writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      })
      .end(JSON.stringify({ sha }));
    return;
  }
  const broken = req.url === '/broken';
  res
    .writeHead(200, { 'content-type': 'text/html' })
    .end(
      `<!doctype html><html><head><title>Verification fixture</title></head><body style="font:24px system-ui;padding:60px"><h1>Task editor</h1><p>Press Save to save this task.</p><button style="font:24px system-ui;padding:16px 40px" onclick="document.getElementById('result').textContent='${broken ? 'Save failed' : 'Saved successfully'}'">Save</button><p id="result">Not saved</p></body></html>`,
    );
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const parent = process.env.VERIFY_SMOKE_OUTPUT_DIR ?? os.tmpdir();
await mkdir(parent, { recursive: true });
const root = await mkdtemp(path.join(parent, 'midscene-verify-browser-'));
const results = [];
const provenance = {
  scope: 'verification-engine-fixture',
  businessPrVerified: false,
  runnerEnvironment:
    process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
  sourceCommit: process.env.GITHUB_SHA ?? null,
  workflowRun: process.env.VERIFY_WORKFLOW_RUN_URL ?? null,
};
try {
  for (const [name, expected] of [
    ['working', 'satisfied'],
    ['broken', 'not-satisfied'],
  ]) {
    const directory = path.join(root, name);
    await mkdir(directory);
    const policy = {
      repository: 'local/smoke',
      installationId: 1,
      environment: 'local',
      allowedOrigins: [origin],
      allowLocalhost: true,
      revisionPath: '/version.json',
      timeoutMs: 120_000,
      criteria: [
        {
          id: 'AC-1',
          title: 'Saving displays a success result',
          path: name === 'broken' ? '/broken' : '/',
          steps: [
            { type: 'aiAct', prompt: 'Click the Save button.' },
            {
              type: 'aiAssert',
              prompt: 'The page displays the exact status Saved successfully.',
            },
          ],
        },
      ],
    };
    const execution = await runBrowser({
      previewUrl: origin,
      policy,
      directory,
      headSha: sha,
    });
    const report = await buildReport({
      id: name === 'working' ? 'a'.repeat(64) : 'b'.repeat(64),
      subject: {
        repository: policy.repository,
        headSha: sha,
        deploymentSha: sha,
      },
      policy,
      execution,
      directory,
      currentHead: sha,
    });
    assert.equal(
      report.execution.status,
      'completed',
      `Browser/model execution failed; inspect ${directory}`,
    );
    assert.equal(report.functionalGate.status, expected);
    if (name === 'broken') {
      assert.equal(execution.criteria[0].errorCode, 'STEP_EXECUTION_FAILED');
      assert.deepEqual(execution.criteria[0].steps, [
        { type: 'aiAct', status: 'passed' },
        { type: 'aiAssert', status: 'failed' },
      ]);
    }
    const inspected = await inspectBundle(directory, {
      headSha: sha,
      expectedPolicyDigest: policyDigest(policy),
      expectedSource: 'local-runner',
    });
    assert.equal(inspected.functionalGate.status, expected);
    results.push({ scenario: name, functionalGate: expected, directory: name });
    console.log(
      JSON.stringify({
        scenario: name,
        functionalGate: expected,
        report: path.join(directory, 'report.html'),
      }),
    );
  }
} finally {
  await writeFile(
    path.join(root, 'run.json'),
    JSON.stringify({ ...provenance, results }, null, 2),
  );
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
