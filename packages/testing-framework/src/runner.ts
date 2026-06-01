import { fork } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFrameworkTestFiles, loadMidsceneConfig } from './config';
import { loadFrameworkDotenv } from './dotenv';
import { createYamlFrameworkSuiteSource } from './runtime/source';
import type {
  FrameworkCaseResult,
  FrameworkSuiteSummary,
  LoadedMidsceneConfig,
} from './types';

const RUNNER_WORKER_RESULT_PREFIX = '__MIDSCENE_RUNNER_WORKER_RESULT__';

const SUITE_MODULE_ID = 'virtual:midscene-framework/suite.test.ts';

export interface FrameworkRstestProject {
  root: string;
  include: string[];
  virtualModules: Record<string, string>;
  maxConcurrency?: number;
  testTimeout?: number;
  bail?: number;
  retry?: number;
}

export type FrameworkRstestRunner = (
  project: FrameworkRstestProject,
) => Promise<{ ok: boolean }>;

export interface RunMidsceneSuiteOptions {
  /** Path to `midscene.config.ts`. Defaults to the one in `cwd`. */
  configPath?: string;
  /** Directory for generated wiring and per-case result files. */
  outputDir?: string;
  /** Override the Rstest runner. Mainly for tests. */
  rstestRunner?: FrameworkRstestRunner;
  stdio?: 'inherit' | 'pipe';
}

interface SuiteCase {
  filePath: string;
  testName: string;
  resultFile: string;
}

const safeStem = (relativePath: string, index: number): string => {
  const base = relativePath
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${String(index + 1).padStart(3, '0')}-${base || 'case'}`;
};

interface WorkerInput {
  cwd: string;
  root: string;
  include: string[];
  virtualModules: Record<string, string>;
  maxConcurrency?: number;
  testTimeout?: number;
  bail?: number;
  retry?: number;
}

interface WorkerOutput {
  ok: boolean;
  unhandledErrors: Array<{
    name?: string;
    message?: string;
    stack?: string;
  }>;
}

const resolveWorkerEntry = (): string => {
  // `runner.js` and `runner-worker.js` ship side-by-side in both the CJS and
  // ESM bundles, so resolving relative to the current module works in both
  // formats. Use `__filename` for CJS and `import.meta.url` for ESM. The ESM
  // build emits `.mjs` files; pick the matching extension.
  const moduleUrl =
    typeof __filename === 'string'
      ? null
      : (import.meta as { url?: string } | undefined)?.url;
  const here = moduleUrl ? fileURLToPath(moduleUrl) : __filename;
  const ext = here.endsWith('.mjs') ? '.mjs' : '.js';
  return resolve(dirname(here), `runner-worker${ext}`);
};

/**
 * Default Rstest driver. We deliberately spawn `runRstest` in a child process:
 * the user's `midscene.config.ts` typically imports playwright (or
 * `@midscene/web/playwright`), which transitively initializes a bundled
 * `@vitest/expect` copy and defines `Symbol.for('$$jest-matchers-object')` on
 * `globalThis` non-configurably. Calling `runRstest` in the same process then
 * fails with `TypeError: Cannot redefine property: Symbol($$jest-matchers-object)`
 * because Rstest's own `@vitest/expect` copy tries to redefine the same global.
 * Forking sidesteps the collision: the child has never imported playwright.
 */
const defaultRstestRunner: FrameworkRstestRunner = async (project) => {
  const workerEntry = resolveWorkerEntry();

  const input: WorkerInput = {
    cwd: project.root,
    root: project.root,
    include: project.include,
    virtualModules: project.virtualModules,
    maxConcurrency: project.maxConcurrency,
    testTimeout: project.testTimeout,
    bail: project.bail,
    retry: project.retry,
  };

  return await new Promise<{ ok: boolean }>((resolveRunner, rejectRunner) => {
    const child = fork(workerEntry, [], {
      cwd: project.root,
      env: process.env,
      stdio: ['pipe', 'pipe', 'inherit', 'ipc'],
    });

    let stdoutBuffer = '';
    let parsedResult: WorkerOutput | undefined;

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (line.startsWith(RUNNER_WORKER_RESULT_PREFIX)) {
          try {
            parsedResult = JSON.parse(
              line.slice(RUNNER_WORKER_RESULT_PREFIX.length),
            ) as WorkerOutput;
          } catch (error) {
            rejectRunner(
              new Error(
                `Failed to parse runner-worker result: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              ),
            );
            return;
          }
        } else if (line.length > 0) {
          process.stdout.write(`${line}\n`);
        }
        newlineIndex = stdoutBuffer.indexOf('\n');
      }
    });

    child.on('error', (error) => {
      rejectRunner(error);
    });

    child.on('exit', (code, signal) => {
      if (
        stdoutBuffer.length > 0 &&
        !stdoutBuffer.startsWith(RUNNER_WORKER_RESULT_PREFIX)
      ) {
        process.stdout.write(stdoutBuffer);
      }

      if (!parsedResult) {
        rejectRunner(
          new Error(
            `runner-worker exited (code=${code ?? 'null'}, signal=${
              signal ?? 'null'
            }) without producing a result`,
          ),
        );
        return;
      }

      if (parsedResult.unhandledErrors.length > 0) {
        for (const error of parsedResult.unhandledErrors) {
          console.error(error.stack || `${error.name}: ${error.message}`);
        }
      }

      resolveRunner({ ok: parsedResult.ok });
    });

    child.stdin?.write(JSON.stringify(input));
    child.stdin?.end();
  });
};

const readCaseResult = (item: SuiteCase): FrameworkCaseResult => {
  if (existsSync(item.resultFile)) {
    return JSON.parse(
      readFileSync(item.resultFile, 'utf8'),
    ) as FrameworkCaseResult;
  }

  return {
    file: item.filePath,
    testName: item.testName,
    success: false,
    duration: 0,
    error: 'Not executed',
  };
};

const writeSummaryFile = (
  loaded: LoadedMidsceneConfig,
  summary: FrameworkSuiteSummary,
): string | undefined => {
  const target = loaded.config.output?.summary;
  if (!target) {
    return undefined;
  }
  const summaryPath = resolve(loaded.root, target);
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  return summaryPath;
};

const printSummary = (summary: FrameworkSuiteSummary, summaryPath?: string) => {
  console.log('\n📊 Midscene suite summary');
  console.log(`   Total: ${summary.total}`);
  console.log(`   Passed: ${summary.passed}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`   Duration: ${(summary.durationMs / 1000).toFixed(2)}s`);
  if (summaryPath) {
    console.log(`   Summary: ${summaryPath}`);
  }
  for (const result of summary.results) {
    if (!result.success) {
      console.log(`   ❌ ${result.testName}: ${result.error ?? 'failed'}`);
    }
  }
};

/**
 * Load `midscene.config.ts`, discover cases, run them through Rstest, and write
 * the suite summary. Intended to be the entire body of a project's
 * `run-suite.ts`:
 *
 * ```ts
 * import { runMidsceneSuite } from '@midscene/testing-framework';
 * await runMidsceneSuite();
 * ```
 */
export async function runMidsceneSuite(
  options: RunMidsceneSuiteOptions = {},
): Promise<FrameworkSuiteSummary> {
  const loaded = await loadMidsceneConfig(options.configPath);

  const dotenvFiles = loadFrameworkDotenv({
    cwd: process.cwd(),
    configDir: loaded.root,
    envConfig: loaded.config.env,
  });
  for (const entry of dotenvFiles) {
    if (entry.loaded) {
      console.log(`   Env file: ${entry.path}`);
    }
  }

  const files = await collectFrameworkTestFiles({
    root: loaded.root,
    config: loaded.config,
  });

  if (files.length === 0) {
    throw new Error(
      `No test files found in ${resolve(loaded.root, loaded.config.testDir || './e2e')}`,
    );
  }

  const outputDir =
    options.outputDir ||
    join(loaded.root, 'midscene_run', 'tmp', `framework-${Date.now()}`);
  const resultDir = join(outputDir, 'results');
  mkdirSync(resultDir, { recursive: true });

  const yamlCases: SuiteCase[] = files
    .filter((file) => file.type === 'yaml')
    .map((file, index) => ({
      filePath: file.filePath,
      testName: file.relativePath,
      resultFile: join(resultDir, `${safeStem(file.relativePath, index)}.json`),
    }));

  const virtualModules: Record<string, string> = {};
  const include: string[] = [];

  if (yamlCases.length > 0) {
    virtualModules[SUITE_MODULE_ID] = createYamlFrameworkSuiteSource({
      configPath: loaded.path,
      projectDir: loaded.root,
      cases: yamlCases,
    });
    include.push(SUITE_MODULE_ID);
  }

  for (const file of files) {
    if (file.type === 'test') {
      include.push(file.filePath);
    }
  }

  const runner = options.rstestRunner || defaultRstestRunner;
  const runResult = await runner({
    root: loaded.root,
    include,
    virtualModules,
    maxConcurrency: loaded.config.testRunner?.maxConcurrency,
    testTimeout: loaded.config.testRunner?.testTimeout,
    bail: loaded.config.testRunner?.bail,
    retry: loaded.config.testRunner?.retry,
  });

  const results = yamlCases.map(readCaseResult);
  const summary: FrameworkSuiteSummary = {
    total: results.length,
    passed: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    durationMs: results.reduce(
      (sum, result) => sum + (result.duration || 0),
      0,
    ),
    results,
  };

  const summaryPath = writeSummaryFile(loaded, summary);
  printSummary(summary, summaryPath);

  if (!runResult.ok || summary.failed > 0) {
    process.exitCode = 1;
  }

  return summary;
}
