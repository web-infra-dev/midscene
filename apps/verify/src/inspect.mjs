import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  digest,
  policyDigest,
  requireValue,
  validatePolicy,
} from './config.mjs';
import { evidenceEntry } from './report.mjs';

// The caller must obtain the bundle from a trusted service and
// independently obtain expected SHA/policy. Hashes prove integrity, not identity.
export async function inspectBundle(
  directory,
  { headSha, expectedPolicyDigest, expectedSource = 'github-app-runner' },
) {
  requireValue(
    /^[a-f0-9]{40}$/.test(headSha ?? ''),
    'Expected current full PR SHA is required',
  );
  requireValue(
    /^sha256:[a-f0-9]{64}$/.test(expectedPolicyDigest ?? ''),
    'Expected trusted policy digest is required',
  );
  const json = async (name) =>
    JSON.parse(await readFile(path.join(directory, name), 'utf8'));
  const manifest = await json('manifest.json');
  requireValue(
    manifest.schemaVersion === '1.0',
    'Unsupported manifest version',
  );
  requireValue(Array.isArray(manifest.files), 'Missing manifest files');
  const names = new Set();
  for (const entry of manifest.files) {
    requireValue(!names.has(entry.path), 'Duplicate manifest entry');
    names.add(entry.path);
    const actual = await evidenceEntry(directory, entry.path);
    requireValue(
      actual.digest === entry.digest && actual.bytes === entry.bytes,
      'Evidence integrity mismatch',
    );
  }
  for (const name of [
    'verdict.json',
    'acceptance.json',
    'summary.md',
    'report.html',
  ])
    requireValue(names.has(name), `Missing ${name}`);
  const report = await json('verdict.json');
  const policy = validatePolicy(await json('acceptance.json'));
  requireValue(report.schemaVersion === '1.0', 'Unsupported verdict version');
  requireValue(
    report.provenance?.kind === expectedSource,
    'Unaccepted report source',
  );
  requireValue(
    report.verificationId === manifest.verificationId,
    'Manifest identity mismatch',
  );
  requireValue(
    (report.operatorPolicyDigest ?? report.policyDigest) ===
      expectedPolicyDigest && policyDigest(policy) === report.policyDigest,
    'Policy identity mismatch',
  );
  requireValue(
    report.subject.headSha === headSha &&
      report.subject.deploymentSha === headSha,
    'Stale or mismatched revision',
  );
  requireValue(
    report.subject.repository === policy.repository,
    'Repository identity mismatch',
  );
  requireValue(
    report.provenance.installationId === policy.installationId,
    'Installation identity mismatch',
  );
  requireValue(
    Array.isArray(report.criteria) &&
      report.criteria.length === policy.criteria.length,
    'Criterion count mismatch',
  );
  if (policy.planning) {
    for (const name of ['plan.json', 'context.json', 'operator-policy.json'])
      requireValue(names.has(name), `Missing ${name}`);
    const plan = await json('plan.json');
    const operator = validatePolicy(await json('operator-policy.json'));
    requireValue(
      policyDigest(operator) === expectedPolicyDigest,
      'Operator policy mismatch',
    );
    requireValue(
      digest(JSON.stringify(plan)) === report.planning?.digest &&
        plan.headSha === headSha &&
        plan.status === report.planning.status,
      'Plan identity mismatch',
    );
    requireValue(
      policyDigest({
        ...operator,
        criteria: [...operator.criteria, ...plan.criteria],
      }) === policyDigest(policy),
      'Execution policy differs from frozen plan',
    );
    if (plan.status !== 'ready')
      requireValue(
        report.functionalGate.status === 'not-satisfied',
        'Incomplete plan cannot pass',
      );
  }
  const ids = new Set(report.criteria.map((item) => item.id));
  requireValue(
    ids.size === policy.criteria.length,
    'Duplicate or missing criteria',
  );
  let passed = 0;
  let failed = 0;
  let notRun = 0;
  for (const expected of policy.criteria) {
    const result = report.criteria.find((item) => item.id === expected.id);
    requireValue(
      result && ['passed', 'failed', 'not-run'].includes(result.status),
      'Invalid criterion result',
    );
    if (result.status === 'passed') {
      passed++;
      requireValue(
        result.steps.length === expected.steps.length &&
          expected.steps.every(
            (step, index) =>
              result.steps[index].type === step.type &&
              result.steps[index].status === 'passed',
          ),
        'Required assertion missing',
      );
      for (const name of [
        `${expected.id}.png`,
        `${expected.id}.trace.json`,
        `${expected.id}.midscene.html`,
      ])
        requireValue(
          names.has(name) && result.evidence.includes(name),
          'Required evidence missing',
        );
    } else if (result.status === 'failed') failed++;
    else notRun++;
  }
  const coverage = { required: policy.criteria.length, passed, failed, notRun };
  requireValue(
    Object.entries(coverage).every(
      ([key, value]) => report.coverage[key] === value,
    ),
    'Coverage totals mismatch',
  );
  const satisfied =
    passed === policy.criteria.length &&
    report.execution.status === 'completed' &&
    report.execution.observedRevisionBefore === headSha &&
    report.execution.observedRevisionAfter === headSha &&
    report.functionalGate.blockingReasons.length === 0;
  requireValue(
    report.functionalGate.status ===
      (satisfied ? 'satisfied' : 'not-satisfied'),
    'Verdict contradicts evidence',
  );
  return {
    verificationId: report.verificationId,
    headSha,
    functionalGate: report.functionalGate,
    coverage,
    limitations: report.limitations,
  };
}
