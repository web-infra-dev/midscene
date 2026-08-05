import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function findScorecards(root) {
  const found = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await findScorecards(entryPath)));
    else if (entry.isFile() && entry.name === 'scorecard.json') found.push(entryPath);
  }
  return found;
}

function summary(aggregate) {
  const icon =
    aggregate.verdict === 'pass'
      ? '✅'
      : aggregate.verdict === 'fail'
        ? '❌'
        : '⚠️';
  const lines = [
    `## ${icon} Nightly Harness`,
    '',
    `Verdict: **${aggregate.verdict}** · Suites: **${aggregate.suites.length}/${aggregate.expectedSuites.length}** · Scored cases: **${aggregate.totals.passed}/${aggregate.totals.scored} passed**`,
    '',
    '| Suite | Verdict | Trace | Cases | Tasks |',
    '| --- | --- | --- | ---: | ---: |',
  ];
  for (const suite of aggregate.suites) {
    lines.push(
      `| ${suite.suite} | ${suite.verdict} | ${suite.traceHealth.status} | ${suite.cases.length} | ${suite.traceHealth.taskCount} |`,
    );
  }
  if (aggregate.issues.length > 0) {
    lines.push('', '### Aggregation issues', '');
    for (const issue of aggregate.issues) lines.push(`- ${issue}`);
  }
  if (aggregate.runUrl) lines.push('', `[Open workflow run](${aggregate.runUrl})`);
  lines.push('');
  return lines.join('\n');
}

async function setOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
  );
}

try {
  const workspace = path.resolve(process.env.GITHUB_WORKSPACE ?? process.cwd());
  const inputDir = path.resolve(
    workspace,
    process.env.HARNESS_AGGREGATE_INPUT ?? 'midscene_run/nightly-input',
  );
  const outputDir = path.resolve(
    workspace,
    process.env.HARNESS_AGGREGATE_OUTPUT ?? 'midscene_run/nightly-aggregate',
  );
  const expectedSuites = process.env.HARNESS_EXPECTED_SUITES
    ? JSON.parse(process.env.HARNESS_EXPECTED_SUITES)
    : Object.keys(
        JSON.parse(
          await readFile(
            path.join(workspace, 'scripts', 'ci-harness', 'suites.json'),
            'utf8',
          ),
        ),
      );
  const scorecardFiles = await findScorecards(inputDir);
  const suites = [];
  const issues = [];
  for (const scorecardFile of scorecardFiles) {
    try {
      const scorecard = JSON.parse(await readFile(scorecardFile, 'utf8'));
      if (!scorecard.suite || !scorecard.verdict || !scorecard.traceHealth) {
        throw new Error('missing required scorecard fields');
      }
      suites.push(scorecard);
    } catch (error) {
      issues.push(
        `Invalid scorecard ${path.relative(workspace, scorecardFile)}: ${error.message}`,
      );
    }
  }

  const suiteNames = suites.map((suite) => suite.suite);
  for (const expected of expectedSuites) {
    if (!suiteNames.includes(expected)) issues.push(`Missing suite: ${expected}`);
  }
  for (const suiteName of new Set(suiteNames)) {
    if (suiteNames.filter((value) => value === suiteName).length > 1) {
      issues.push(`Duplicate suite scorecard: ${suiteName}`);
    }
  }

  suites.sort((a, b) => a.suite.localeCompare(b.suite));
  const cases = suites.flatMap((suite) => suite.cases ?? []);
  const verdict =
    issues.length > 0 || suites.some((suite) => suite.verdict === 'infra_error')
      ? 'infra_error'
      : suites.some((suite) => suite.verdict === 'fail')
        ? 'fail'
        : 'pass';
  const runId = process.env.GITHUB_RUN_ID;
  const aggregate = {
    schemaVersion: 1,
    verdict,
    conclusion: verdict === 'pass' ? 'success' : 'failure',
    runId,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
    runUrl:
      process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && runId
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}`
        : undefined,
    expectedSuites,
    totals: {
      scored: cases.filter((item) => item.score === 0 || item.score === 1).length,
      passed: cases.filter((item) => item.score === 1).length,
      failed: cases.filter((item) => item.score === 0).length,
    },
    suites,
    issues,
  };

  await mkdir(outputDir, { recursive: true });
  const summaryContent = summary(aggregate);
  const scorecardPath = path.join(outputDir, 'aggregate-scorecard.json');
  await writeFile(scorecardPath, `${JSON.stringify(aggregate, null, 2)}\n`);
  await writeFile(path.join(outputDir, 'summary.md'), summaryContent);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summaryContent}\n`);
  }
  await setOutputs({
    conclusion: aggregate.conclusion,
    verdict: aggregate.verdict,
    'output-dir': outputDir,
  });
} catch (error) {
  console.error(`::error::Nightly harness aggregation failed: ${error.stack || error}`);
  process.exitCode = 1;
}
