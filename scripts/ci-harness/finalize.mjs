import { appendFile } from 'node:fs/promises';
import { finalizeHarnessRun, resolveStages } from './lib.mjs';

function input(name, fallback = '') {
  return process.env[name] ?? fallback;
}

async function setOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) return;
  const content = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  await appendFile(process.env.GITHUB_OUTPUT, `${content}\n`);
}

try {
  const workspace = input('GITHUB_WORKSPACE', process.cwd());
  const suite = input('HARNESS_SUITE');
  const stages = await resolveStages({
    workspace,
    suite,
    inlineStages: input('HARNESS_STAGES'),
    outcomes: input('HARNESS_OUTCOMES'),
  });
  const result = await finalizeHarnessRun({
    workspace,
    suite,
    stages,
    reportRoots: input('HARNESS_REPORT_ROOTS'),
    evidenceRoots: input('HARNESS_EVIDENCE_ROOTS'),
    outputDir: input('HARNESS_OUTPUT_DIR') || undefined,
    environment: process.env,
  });
  await setOutputs({
    conclusion: result.scorecard.conclusion,
    verdict: result.scorecard.verdict,
    'output-dir': result.outputDir,
    'scorecard-path': result.scorecardPath,
  });
  console.log(
    `Harness ${result.scorecard.suite}: ${result.scorecard.verdict} (${result.scorecard.traceHealth.status} trace)`,
  );
} catch (error) {
  console.error(
    `::error::Harness finalization failed: ${error.stack || error}`,
  );
  process.exitCode = 1;
}
