import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { runRstestWithVirtualModules } from '@midscene/shared/rstest';
import { resolveMidsceneConfigPath } from './config';
import { SUITE_SUMMARY_FILENAME, emptySuiteSummary } from './result';
import { createBootstrapModuleSource } from './runtime/source';
import type { FrameworkSuiteSummary } from './types';

const SUITE_MODULE_ID = 'virtual:midscene-framework/suite.test.ts';

export interface FrameworkBootstrapProject {
  /** Project root passed to Rstest. */
  root: string;
  /** Rstest `include` entries (the bootstrap virtual module). */
  include: string[];
  /** Virtual modules registered with Rstest's bundler. */
  virtualModules: Record<string, string>;
  /** Directory per-case result files are written to. */
  resultDir: string;
}

export interface FrameworkBootstrapRunResult {
  ok: boolean;
}

export type FrameworkBootstrapRunner = (
  project: FrameworkBootstrapProject,
) => Promise<FrameworkBootstrapRunResult>;

export interface RunMidsceneTestOptions {
  /** Path to `midscene.config.ts`. Defaults to the one resolved from `cwd`. */
  configPath?: string;
  /** Directory for generated wiring and per-case result files. */
  outputDir?: string;
  /** Override the Rstest runner. Mainly for tests. */
  rstestRunner?: FrameworkBootstrapRunner;
}

/**
 * Default in-process Rstest driver. It runs `runRstest` directly in the current
 * process: the runner never imports the user's `midscene.config` (only the
 * Rstest worker that loads the bootstrap module does), so the Playwright
 * `@vitest/expect` global never collides with Rstest's own copy. `@rsbuild/core`
 * is resolved relative to the *project's* `@rstest/core` (a peer dependency) so
 * the `VirtualModulesPlugin` matches the bundler Rstest actually uses. The
 * `runRstest` wiring itself is shared with `@midscene/cli` via
 * `@midscene/shared/rstest`.
 */
const defaultBootstrapRunner: FrameworkBootstrapRunner = async (project) => {
  const projectRequire = createRequire(resolve(project.root, 'package.json'));
  const rstestPkgJson = projectRequire.resolve('@rstest/core/package.json');
  const rsbuildEntry = createRequire(rstestPkgJson).resolve('@rsbuild/core');

  const result = await runRstestWithVirtualModules({
    cwd: project.root,
    root: project.root,
    include: project.include,
    virtualModules: project.virtualModules,
    rsbuildEntry,
    testTimeout: 0,
    maxConcurrency: 1,
  });

  return { ok: Boolean(result?.ok) };
};

/**
 * Read the single summary the worker wrote into `resultDir`. The worker owns
 * result aggregation; the runner only reads its hand-off file (no per-case file
 * globbing or re-derivation here).
 */
const readSuiteSummary = (resultDir: string): FrameworkSuiteSummary => {
  const summaryPath = join(resultDir, SUITE_SUMMARY_FILENAME);
  if (!existsSync(summaryPath)) {
    return emptySuiteSummary();
  }
  return JSON.parse(readFileSync(summaryPath, 'utf8')) as FrameworkSuiteSummary;
};

const printSummary = (summary: FrameworkSuiteSummary, runnerOk: boolean) => {
  console.log('\n📊 Midscene suite summary');
  console.log(`   Total: ${summary.total}`);
  console.log(`   Passed: ${summary.passed}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`   Duration: ${(summary.durationMs / 1000).toFixed(2)}s`);
  if (summary.suiteError) {
    console.log(`   ⚠️  Suite failed before cases ran: ${summary.suiteError}`);
  } else if (!runnerOk && summary.total === 0) {
    console.log(
      '   ⚠️  Suite failed before any case produced a result; see the Rstest output above.',
    );
  }
  for (const result of summary.results) {
    if (!result.success) {
      console.log(`   ❌ ${result.testName}: ${result.error ?? 'failed'}`);
    }
  }
};

/**
 * Mode A entry: run a `midscene.config.ts` project's cases in-process through
 * Rstest. The runner only resolves the config *path* — discovery, setup, and
 * the config import all happen inside the Rstest worker via the generated
 * bootstrap module.
 *
 * ```ts
 * import { runMidsceneTest } from '@midscene/testing-framework';
 * await runMidsceneTest();
 * ```
 */
export async function runMidsceneTest(
  options: RunMidsceneTestOptions = {},
): Promise<FrameworkSuiteSummary> {
  const configPath = resolveMidsceneConfigPath(options.configPath);
  if (!existsSync(configPath)) {
    throw new Error(`midscene config not found: ${configPath}`);
  }
  const projectDir = resolve(configPath, '..');

  const outputDir =
    options.outputDir ||
    join(projectDir, 'midscene_run', 'tmp', `framework-${Date.now()}`);
  const resultDir = join(outputDir, 'results');
  mkdirSync(resultDir, { recursive: true });

  const project: FrameworkBootstrapProject = {
    root: projectDir,
    include: [SUITE_MODULE_ID],
    virtualModules: {
      [SUITE_MODULE_ID]: createBootstrapModuleSource({
        configPath,
        projectDir,
        resultDir,
      }),
    },
    resultDir,
  };

  const runner = options.rstestRunner || defaultBootstrapRunner;
  const runResult = await runner(project);

  const summary = readSuiteSummary(resultDir);
  printSummary(summary, runResult.ok);

  if (!runResult.ok || summary.failed > 0 || summary.suiteError) {
    process.exitCode = 1;
  }

  return summary;
}
