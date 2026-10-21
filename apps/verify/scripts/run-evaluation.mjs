import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { scenario } from '../evaluation/fixtures.mjs';
import { runEvaluation } from '../evaluation/run.mjs';

const root = process.argv[2];
if (!root)
  throw new Error(
    'Usage: node scripts/run-evaluation.mjs NEW_OUTPUT_DIRECTORY',
  );
if (process.env.VERIFY_MODEL_ENV_FILE) {
  for (const [key, value] of Object.entries(
    parseEnv(await readFile(process.env.VERIFY_MODEL_ENV_FILE, 'utf8')),
  ))
    process.env[key] ??= value;
}
if (process.env.OPENAI_API_KEY)
  process.env.MIDSCENE_MODEL_API_KEY ??= process.env.OPENAI_API_KEY;
if (process.env.OPENAI_BASE_URL)
  process.env.MIDSCENE_MODEL_BASE_URL ??= process.env.OPENAI_BASE_URL;
const plannerModel =
  process.env.VERIFY_PLANNER_MODEL ?? process.env.MIDSCENE_MODEL_NAME;
const visualModel = process.env.MIDSCENE_MODEL_NAME;
if (!plannerModel || !visualModel || !process.env.MIDSCENE_MODEL_API_KEY)
  throw new Error('Configure the planner and visual models before evaluation');
process.env.MIDSCENE_MODEL_RETRY_COUNT = '0';
const cwd = new URL('../../../', import.meta.url);
const git = (...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
if (
  git(
    'status',
    '--porcelain',
    '--untracked-files=normal',
    '--',
    'apps/verify',
    'packages',
    'pnpm-lock.yaml',
  )
)
  throw new Error(
    'Commit engine changes before collecting a pinned evaluation',
  );
const engineSha = git('rev-parse', 'HEAD');
const corpus = JSON.parse(
  await readFile(new URL('../evaluation/cases.json', import.meta.url), 'utf8'),
);
const server = createServer((request, response) => {
  const [route, resource] = new URL(request.url, 'http://localhost').pathname
    .slice(1)
    .split('/');
  const id = corpus.cases.find((_, index) => route === `case-${index + 1}`)?.id;
  let fixture;
  try {
    fixture = scenario(id);
  } catch {
    response.writeHead(404).end();
    return;
  }
  response.setHeader('cache-control', 'no-store');
  if (id === 'preview-unavailable') {
    response.writeHead(503).end('Preview unavailable');
    return;
  }
  if (resource === 'version.json') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        sha: id === 'stale-revision' ? '0'.repeat(40) : engineSha,
      }),
    );
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html' }).end(fixture.html);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const result = await runEvaluation({
    root: path.resolve(root),
    origin: `http://127.0.0.1:${server.address().port}`,
    engineSha,
    plannerModel,
    visualModel,
    provenance: {
      runnerEnvironment:
        process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
      workflowRun: process.env.VERIFY_WORKFLOW_RUN_URL ?? null,
      modelRetryCount: 0,
      plannerThinking:
        process.env.VERIFY_PLANNER_ENABLE_THINKING ?? 'provider-default',
    },
  });
  console.log(
    JSON.stringify({
      output: path.resolve(root),
      metrics: result.metrics,
      passed: result.passed,
    }),
  );
  if (!result.passed) process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
