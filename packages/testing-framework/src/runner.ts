import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RstestUserConfig } from '@rstest/core/api';
import { resolveMidsceneConfigPath } from './config';
import { buildSuiteSummary } from './result';
import { createBootstrapModuleSource } from './runtime/source';
import type { FrameworkCaseResult, FrameworkSuiteSummary } from './types';

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
 * Default in-process Rstest driver. Unlike the previous forked worker, this
 * runs `runRstest` directly in the current process: the runner never imports
 * the user's `midscene.config` (only the Rstest worker that loads the bootstrap
 * module does), so the Playwright `@vitest/expect` global never collides with
 * Rstest's own copy. `@rsbuild/core` is resolved relative to `@rstest/core` so
 * the `VirtualModulesPlugin` matches the bundler Rstest actually uses.
 */
const defaultBootstrapRunner: FrameworkBootstrapRunner = async (project) => {
  const projectRequire = createRequire(resolve(project.root, 'package.json'));
  const rstestPkgJson = projectRequire.resolve('@rstest/core/package.json');
  const rsbuildEntry = createRequire(rstestPkgJson).resolve('@rsbuild/core');

  const [{ runRstest }, { rspack }] = await Promise.all([
    import('@rstest/core/api'),
    import(pathToFileURL(rsbuildEntry).href),
  ]);

  const inlineConfig: RstestUserConfig = {
    root: project.root,
    include: project.include,
    testEnvironment: 'node',
    testTimeout: 0,
    pool: { maxWorkers: 1, minWorkers: 1 },
    tools: {
      rspack: (_config, { appendPlugins }) => {
        appendPlugins(
          new rspack.experiments.VirtualModulesPlugin(project.virtualModules),
        );
      },
    },
  };

  const result = await runRstest({ cwd: project.root, inlineConfig });

  return { ok: Boolean(result?.ok) };
};

const readResults = (resultDir: string): FrameworkCaseResult[] => {
  if (!existsSync(resultDir)) {
    return [];
  }
  return readdirSync(resultDir)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map(
      (name) =>
        JSON.parse(
          readFileSync(join(resultDir, name), 'utf8'),
        ) as FrameworkCaseResult,
    );
};

const printSummary = (summary: FrameworkSuiteSummary) => {
  console.log('\n📊 Midscene suite summary');
  console.log(`   Total: ${summary.total}`);
  console.log(`   Passed: ${summary.passed}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`   Duration: ${(summary.durationMs / 1000).toFixed(2)}s`);
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

  const summary = buildSuiteSummary(readResults(resultDir));
  printSummary(summary);

  if (!runResult.ok || summary.failed > 0) {
    process.exitCode = 1;
  }

  return summary;
}
