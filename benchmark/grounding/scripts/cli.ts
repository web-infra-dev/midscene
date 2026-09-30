#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'dotenv';

const { values } = parseArgs({
  options: {
    help: { type: 'boolean', short: 'h' },
    config: { type: 'string' },
    'env-file': { type: 'string' },
    'models-file': { type: 'string' },
    model: { type: 'string' },
    family: { type: 'string' },
    'api-type': { type: 'string' },
    'run-id': { type: 'string' },
    concurrency: { type: 'string' },
    cases: { type: 'string' },
    limit: { type: 'string' },
    platform: { type: 'string' },
    category: { type: 'string' },
    'output-dir': { type: 'string' },
    'modelhub-crawl': { type: 'boolean' },
  },
});
if (values.help) {
  console.log(`Grounding benchmark — current local @midscene/core, fixed Web100 + Mobile100.
  pnpm evaluate --env-file .env
  pnpm evaluate --config examples/run-config.json --models-file /path/models.json
Options: --model NAME --family FAMILY --api-type responses|chat-completions
         --platform web|mobile --category basic|functional|reason|refusal
         --cases ID,ID --limit N --concurrency 1..5 --run-id ID --output-dir PATH
         --modelhub-crawl  Forward chat requests through ModelHub /v2/crawl.
Output: run-config.json, state.json, results.json, report.html (standalone),
        report-live.html, images/, midscene-main.diff, dataset-snapshot.json.
All API/parse failures remain in the denominator. Run IDs never overwrite results.`);
  process.exit(0);
}
if (values['env-file']) {
  const text = await readFile(path.resolve(values['env-file']), 'utf8');
  Object.assign(process.env, parse(text.replace(/;[ \t]*$/gm, '')));
}
if (values['models-file'])
  process.env.GROUNDING_MODELS_FILE = path.resolve(values['models-file']);
if (values['output-dir'])
  process.env.TASK_OUTPUT_ROOT = path.resolve(values['output-dir']);
if (values.model) process.env.MIDSCENE_MODEL_NAME = values.model;
if (values.family) process.env.MIDSCENE_MODEL_FAMILY = values.family;
if (values['api-type']) {
  if (!['responses', 'chat-completions'].includes(values['api-type']))
    throw new Error('Unsupported --api-type');
  if (values['api-type'] === 'responses')
    process.env.MIDSCENE_MODEL_API_TYPE = 'responses';
  else {
    // biome-ignore lint/performance/noDelete: process.env coerces undefined to the string "undefined".
    delete process.env.MIDSCENE_MODEL_API_TYPE;
  }
}
let closeAdapter: (() => Promise<void>) | undefined;
try {
  if (values['modelhub-crawl']) {
    if (values['models-file'])
      throw new Error(
        '--modelhub-crawl uses the single model env configuration',
      );
    const { startModelHubAdapter } = await import(
      '../evaluation/runtime/modelhub-adapter.js'
    );
    process.env.GROUNDING_MODELHUB_API_KEY = process.env.MIDSCENE_MODEL_API_KEY;
    const adapter = await startModelHubAdapter({
      baseUrl: process.env.MIDSCENE_MODEL_BASE_URL || '',
      apiKey: process.env.MIDSCENE_MODEL_API_KEY || '',
      model: process.env.MIDSCENE_MODEL_NAME || '',
    });
    closeAdapter = adapter.close;
    process.env.MIDSCENE_MODEL_BASE_URL = adapter.baseUrl;
    process.env.MIDSCENE_MODEL_API_KEY = 'local-grounding-adapter';
    // biome-ignore lint/performance/noDelete: remove the env override, do not stringify undefined.
    delete process.env.MIDSCENE_MODEL_API_TYPE;
  }
  const { normalizeMidsceneRunConfig } = await import(
    '../evaluation/midscene/normalize-run-config.js'
  );
  const { loadModels, loadManifest } = await import(
    '../evaluation/runtime/load-data.js'
  );
  const { ensureRunDir } = await import('../evaluation/runtime/task-store.js');
  const { validateDataset } = await import('./validate-dataset.js');
  console.log('Dataset verified:', JSON.stringify(await validateDataset()));
  const raw = values.config
    ? JSON.parse(await readFile(path.resolve(values.config), 'utf8'))
    : {};
  const config = normalizeMidsceneRunConfig(raw);
  const models = await loadModels();
  if (!config.selection.modelIds.length)
    config.selection.modelIds = models.map((model) => model.id);
  const manifest = await loadManifest();
  if (!config.selection.caseNames.length)
    config.selection.caseNames = manifest.map((row) => row.case_name);
  if (values.cases)
    config.selection.caseNames = values.cases
      .split(',')
      .map((value) => value.trim());
  if (values.platform && !['web', 'mobile'].includes(values.platform))
    throw new Error('Unsupported platform');
  if (
    values.category &&
    !['basic', 'functional', 'reason', 'refusal'].includes(values.category)
  )
    throw new Error('Unsupported category');
  if (values.platform || values.category)
    config.selection.caseNames = config.selection.caseNames.filter((name) => {
      const row = manifest.find((row) => row.case_name === name);
      return (
        row &&
        (!values.platform || row.platform === values.platform) &&
        (!values.category || row.task_class === values.category)
      );
    });
  if (values.limit) {
    const limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error('--limit must be a positive integer');
    config.selection.caseNames = config.selection.caseNames.slice(0, limit);
  }
  if (!config.selection.caseNames.length)
    throw new Error('No cases match this selection');
  if (values.concurrency) {
    const count = Number(values.concurrency);
    if (!Number.isInteger(count) || count < 1 || count > 5)
      throw new Error('--concurrency must be 1..5');
    config.execution.providerConcurrency = count;
  }
  config.execution.runId =
    values['run-id'] ||
    config.execution.runId ||
    `${new Date().toISOString().replace(/[:.]/g, '-')}-grounding`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(config.execution.runId))
    throw new Error('Invalid --run-id');
  config.meta.title ||= 'Web v4.7 + Mobile v4.6 Grounding';
  const runDir = await ensureRunDir(config.execution.runId);
  const configPath = path.join(runDir, 'run-config.json');
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    flag:
      values.config && path.resolve(values.config) === configPath ? 'w' : 'wx',
  });
  await writeFile(
    path.join(runDir, 'dataset-snapshot.json'),
    `${JSON.stringify(
      manifest.filter((row) =>
        config.selection.caseNames.includes(row.case_name),
      ),
      null,
      2,
    )}\n`,
  );
  const { runEvaluation } = await import('./run-midscene-evaluation.js');
  await runEvaluation(configPath);
} finally {
  await closeAdapter?.();
}
