import { parseArgs } from 'node:util';
import { inspectBundle } from '../src/inspect.mjs';

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { sha: { type: 'string' }, 'policy-digest': { type: 'string' } },
  });
  if (positionals.length !== 1)
    throw new Error(
      'Usage: node scripts/inspect.mjs <bundle-directory> --sha <current-sha> --policy-digest sha256:<trusted-digest>',
    );
  const result = await inspectBundle(positionals[0], {
    headSha: values.sha,
    expectedPolicyDigest: values['policy-digest'],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.functionalGate.status === 'satisfied' ? 0 : 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
  process.exitCode = 2;
}
