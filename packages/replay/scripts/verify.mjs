import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { freezeInputs } from './frozen-inputs.mjs';
import { writeReviewSheets, writeStepIndex } from './report-evidence.mjs';
import { loadTest } from './test-runner.mjs';

const worker = fileURLToPath(new URL('./verify-worker.mjs', import.meta.url));
async function execute(optionsFile, out, env) {
  const child = spawn(process.execPath, [worker, optionsFile], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  child.stdout.on('data', (bytes) => log.push(bytes));
  child.stderr.on('data', (bytes) => log.push(bytes));
  const interrupt = () => child.kill('SIGINT');
  process.on('SIGINT', interrupt);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code));
    });
  } finally {
    process.off('SIGINT', interrupt);
    writeFileSync(join(out, 'console.log'), Buffer.concat(log));
  }
}
export async function verify(
  input,
  { caseName, runs = 3, out, configPath } = {},
) {
  if (!Number.isSafeInteger(runs) || runs < 1)
    throw new Error('--runs must be a positive integer.');
  input = resolve(input);
  const test = await loadTest();
  const config = configPath
    ? resolve(configPath)
    : (test.discoverTestConfig(process.cwd()) ??
      test.discoverTestConfig(dirname(input)));
  const root = config ? dirname(config) : dirname(input);
  const inputPath = relative(root, input);
  if (
    inputPath === '..' ||
    inputPath.startsWith(`..${sep}`) ||
    isAbsolute(inputPath)
  )
    throw new Error(
      'VERIFY_INPUT_OUTSIDE_PROJECT: keep the YAML and its config in the same authoring project.',
    );
  out = resolve(
    out ??
      join(getMidsceneRunSubDir('test-results'), `replay-verify-${Date.now()}`),
  );
  mkdirSync(dirname(out), { recursive: true });
  mkdirSync(out);
  const result = {
    execution: 'failed',
    mode: runs >= 3 ? 'acceptance' : 'diagnostic',
    requestedRuns: runs,
    completedRuns: 0,
    reports: [],
    review: 'pending',
    errors: [],
  };
  const reports = [];
  try {
    const frozen = freezeInputs(root, out);
    for (let index = 1; index <= runs; index++) {
      frozen.unchanged();
      const dir = join(out, `run-${index}`);
      mkdirSync(dir);
      const options = {
        cwd: frozen.destination,
        projectRoot: frozen.destination,
        testPath: join(frozen.destination, relative(root, input)),
        ...(config
          ? { configPath: join(frozen.destination, relative(root, config)) }
          : {}),
        caseName,
        out: dir,
        manifest: { destination: frozen.destination, files: frozen.files },
      };
      const optionsFile = join(dir, 'options.json');
      writeFileSync(optionsFile, JSON.stringify(options, null, 2));
      const code = await execute(optionsFile, dir, {
        ...process.env,
        MIDSCENE_RUN_DIR: dir,
      });
      const file = join(dir, 'replay.json');
      if (!existsSync(file))
        throw new Error(
          `VERIFY_WORKER_FAILED: see ${join(dir, 'console.log')}`,
        );
      const report = JSON.parse(readFileSync(file, 'utf8'));
      reports.push({ index, folder: `run-${index}`, ...report });
      result.reports.push({
        index,
        result: file,
        report: report.result?.reportPath,
        status: report.result?.status,
      });
      frozen.unchanged();
      if (
        code !== 0 ||
        report.result?.status !== 'success' ||
        !report.result.summary.total ||
        report.result.cases.some(
          ({ run, attempts }) =>
            !run ||
            (attempts?.length ?? 1) !== 1 ||
            [...run.beforeEach, ...run.steps, ...run.afterEach].some(
              (step) => step.status !== 'success',
            ),
        ) ||
        report.result.documents.some((document) =>
          [...document.beforeAll, ...document.afterAll].some(
            (step) => step.status !== 'success',
          ),
        )
      )
        throw new Error(
          `VERIFY_RUN_FAILED: run ${index}; see its native report and console.log`,
        );
      result.completedRuns++;
    }
    result.execution = 'passed';
  } catch (error) {
    result.errors.push({ message: error.message, stack: error.stack });
  }
  try {
    const sheets = writeStepIndex(reports, out);
    await writeReviewSheets(sheets, out);
  } catch (error) {
    result.execution = 'failed';
    result.errors.push({ message: `Evidence publication: ${error.message}` });
  }
  writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2));
  if (result.execution !== 'passed') process.exitCode = 1;
  return {
    ...result,
    out,
    steps: join(out, 'steps.md'),
    note: 'Execution evidence only. The coding Agent must independently review the business outcome.',
  };
}
