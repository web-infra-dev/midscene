import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectFrameworkTestFiles, loadMidsceneConfig } from './config';
import { createYamlFrameworkSuiteSource } from './runtime/source';
import type {
  FrameworkCaseResult,
  FrameworkSuiteSummary,
  LoadedMidsceneConfig,
} from './types';

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

/**
 * Default Rstest driver. It reuses the same `runRstest` + virtual-module
 * mechanism the CLI YAML runner already relies on, so framework cases execute
 * inside Rstest instead of a bespoke concurrent runner.
 */
const defaultRstestRunner: FrameworkRstestRunner = async (project) => {
  const projectRequire = createRequire(resolve(project.root, 'package.json'));
  const rstestPkgJson = projectRequire.resolve('@rstest/core/package.json');
  const rsbuildEntry = createRequire(rstestPkgJson).resolve('@rsbuild/core');

  const [{ runRstest }, { rspack }] = await Promise.all([
    import('@rstest/core/api'),
    import(pathToFileURL(rsbuildEntry).href),
  ]);

  const maxConcurrency =
    project.maxConcurrency !== undefined
      ? Math.max(1, project.maxConcurrency)
      : undefined;

  const inlineConfig: Record<string, unknown> = {
    root: project.root,
    include: project.include,
    testEnvironment: 'node',
    ...(project.testTimeout !== undefined
      ? { testTimeout: project.testTimeout }
      : {}),
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
    ...(maxConcurrency !== undefined
      ? { pool: { maxWorkers: maxConcurrency, minWorkers: maxConcurrency } }
      : {}),
    ...(project.bail !== undefined ? { bail: project.bail } : {}),
    ...(project.retry !== undefined ? { retry: project.retry } : {}),
    tools: {
      rspack: (
        _config: unknown,
        { appendPlugins }: { appendPlugins: (plugin: unknown) => void },
      ) => {
        appendPlugins(
          new rspack.experiments.VirtualModulesPlugin(project.virtualModules),
        );
      },
    },
  };

  const result = await runRstest({ cwd: project.root, inlineConfig });
  return { ok: Boolean(result?.ok) };
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
