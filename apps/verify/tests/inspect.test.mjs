import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { policyDigest } from '../src/config.mjs';
import { inspectBundle } from '../src/inspect.mjs';
import { buildReport, evidenceEntry } from '../src/report.mjs';
import { passingRunner, policy, sha, temporary } from './helpers.mjs';

async function bundle(t) {
  const { root } = await temporary(t);
  await buildReport({
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
    source: 'github-app-runner',
  });
  return root;
}
const expected = { headSha: sha, expectedPolicyDigest: policyDigest(policy) };

test('independent consumer verifies the bundle and rejects wrong SHA/policy', async (t) => {
  const root = await bundle(t);
  assert.equal(
    (await inspectBundle(root, expected)).functionalGate.status,
    'satisfied',
  );
  await assert.rejects(
    inspectBundle(root, { ...expected, headSha: 'b'.repeat(40) }),
    /revision/,
  );
  await assert.rejects(
    inspectBundle(root, {
      ...expected,
      expectedPolicyDigest: `sha256:${'b'.repeat(64)}`,
    }),
    /Policy/,
  );
});

test('independent consumer rejects modified screenshots', async (t) => {
  const root = await bundle(t);
  await writeFile(path.join(root, 'AC-1.png'), 'replacement');
  await assert.rejects(inspectBundle(root, expected), /integrity/);
});

test('local smoke output is not accepted as GitHub App evidence', async (t) => {
  const { root } = await temporary(t);
  await buildReport({
    id: 'a'.repeat(64),
    subject: {
      repository: policy.repository,
      headSha: sha,
      deploymentSha: sha,
    },
    policy,
    execution: await passingRunner({ directory: root }),
    directory: root,
    currentHead: sha,
  });
  await assert.rejects(inspectBundle(root, expected), /report source/);
});

test('recomputed manifest cannot hide contradictory assertion results', async (t) => {
  const root = await bundle(t);
  const report = JSON.parse(await readFile(path.join(root, 'verdict.json')));
  report.criteria[0].steps[1].status = 'failed';
  await writeFile(path.join(root, 'verdict.json'), JSON.stringify(report));
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json')));
  manifest.files = await Promise.all(
    manifest.files.map((entry) => evidenceEntry(root, entry.path)),
  );
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(inspectBundle(root, expected), /assertion/);
});
