import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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

const snapshotScript = fileURLToPath(
  new URL('../snapshot-reports.mjs', import.meta.url),
);

function runSnapshot(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [snapshotScript], {
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

test('moves one test stage report into an immutable snapshot', async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'midscene-snapshot-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const source = path.join(workspace, 'midscene_run', 'report');
  const destination = path.join(
    workspace,
    'midscene_run',
    'harness-input',
    'basic',
  );
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'case.html'), '<html></html>');

  const execution = await runSnapshot({
    GITHUB_WORKSPACE: workspace,
    HARNESS_SNAPSHOT_SOURCE: 'midscene_run/report',
    HARNESS_SNAPSHOT_DESTINATION: 'midscene_run/harness-input/basic',
  });
  assert.equal(execution.code, 0, execution.stderr);
  await assert.rejects(access(source));
  assert.equal(
    await readFile(path.join(destination, 'case.html'), 'utf8'),
    '<html></html>',
  );

  const repeated = await runSnapshot({
    GITHUB_WORKSPACE: workspace,
    HARNESS_SNAPSHOT_SOURCE: 'midscene_run/report',
    HARNESS_SNAPSHOT_DESTINATION: 'midscene_run/harness-input/basic',
  });
  assert.equal(repeated.code, 1);
  assert.match(repeated.stderr, /immutable and already exists/);
});

test('copies a report snapshot when a later stage consumes the source', async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'midscene-snapshot-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const source = path.join(workspace, 'midscene_run', 'report');
  const destination = path.join(
    workspace,
    'midscene_run',
    'harness-input',
    'basic',
  );
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'case.html'), '<html></html>');

  const execution = await runSnapshot({
    GITHUB_WORKSPACE: workspace,
    HARNESS_SNAPSHOT_SOURCE: 'midscene_run/report',
    HARNESS_SNAPSHOT_DESTINATION: 'midscene_run/harness-input/basic',
    HARNESS_SNAPSHOT_MODE: 'copy',
  });
  assert.equal(execution.code, 0, execution.stderr);
  assert.equal(
    await readFile(path.join(source, 'case.html'), 'utf8'),
    '<html></html>',
  );
  assert.equal(
    await readFile(path.join(destination, 'case.html'), 'utf8'),
    '<html></html>',
  );
});
