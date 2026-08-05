import { appendFile, readFile } from 'node:fs/promises';
import { renderSummary } from './lib.mjs';

try {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    throw new Error('GITHUB_STEP_SUMMARY is not available');
  }
  const scorecard = JSON.parse(
    await readFile(process.env.HARNESS_SCORECARD_PATH, 'utf8'),
  );
  const summary = renderSummary(scorecard, {
    artifactUrl: process.env.HARNESS_ARTIFACT_URL,
    traceBaseUrl: process.env.HARNESS_TRACE_BASE_URL,
  });
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
} catch (error) {
  console.error(
    `::error::Unable to publish harness summary: ${error.stack || error}`,
  );
  process.exitCode = 1;
}
