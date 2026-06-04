/**
 * The Rstest-backed orchestrator — the default case-orchestration layer for the
 * v2 testing framework.
 *
 * Discovery (which YAML cases to run) is ours; scheduling, concurrency, bail,
 * retry, and per-test isolation are delegated to Rstest. Each case runs in an
 * Rstest worker via `defineMidsceneCaseTest` and writes a `CaseResult` JSON;
 * this function aggregates those into a {@link RunSummary} and writes
 * `output.summary`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getDebug } from '@midscene/shared/logger';
import type { MidsceneConfig } from '../config/types';
import { loadConfig } from '../runner/load-config';
import {
  resolveCaseFiles,
  summarizeCases,
  writeSummaryFile,
} from '../runner/run';
import type { CaseResult, RunSummary } from '../types';
import {
  type CreateRstestProjectOptions,
  type GeneratedCase,
  createRstestProject,
} from './project';
import { type RunRstestProjectOptions, runRstestProject } from './runner';

const debug = getDebug('testing-framework:rstest');

export interface RunWithRstestOptions {
  /** Path to `midscene.config.*` or the project directory containing it. */
  configPath?: string;
  /** Root for case discovery and output; defaults to the config's directory. */
  projectRoot?: string;
  /** Restrict to specific case files (absolute or project-relative). */
  files?: string[];
  /** Directory for generated Rstest artifacts. */
  outputDir?: string;
  stdio?: 'inherit' | 'pipe';
  env?: NodeJS.ProcessEnv;
  /** Injectable runner (defaults to {@link runRstestProject}); used in tests. */
  rstestRunner?: (options: RunRstestProjectOptions) => Promise<number>;
}

export interface RunWithRstestResult {
  summary: RunSummary;
  /** Rstest's exit code (0 ok). The summary reflects per-case results. */
  exitCode: number;
}

const projectOptionsFromConfig = (
  config: MidsceneConfig,
  configPath: string,
  projectDir: string,
  files: string[],
  outputDir?: string,
): CreateRstestProjectOptions => {
  const runner = config.testRunner ?? {};
  return {
    configPath,
    files,
    projectDir,
    outputDir,
    maxConcurrency: runner.maxConcurrency,
    bail: runner.bail,
    testTimeout: runner.testTimeout,
    retry: runner.retry,
  };
};

const readCaseResult = (item: GeneratedCase): CaseResult | undefined => {
  if (!existsSync(item.resultFile)) {
    debug('missing result file (case not executed)', item.testName);
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(item.resultFile, 'utf-8')) as CaseResult;
  } catch (error) {
    debug('unreadable result file', item.resultFile, error);
    return {
      name: item.testName,
      file: item.yamlFile,
      status: 'failed',
      steps: [],
      warnings: [`Unreadable result file: ${item.resultFile}`],
      durationMs: 0,
    };
  }
};

export async function runWithRstest(
  options: RunWithRstestOptions = {},
): Promise<RunWithRstestResult> {
  const { config, configPath } = await loadConfig(options.configPath);
  const projectDir = options.projectRoot
    ? resolve(options.projectRoot)
    : dirname(configPath);

  const files = resolveCaseFiles(config, projectDir, options.files);
  debug('discovered cases', files);

  const startedAt = new Date();

  const project = createRstestProject(
    projectOptionsFromConfig(
      config,
      configPath,
      projectDir,
      files,
      options.outputDir,
    ),
  );

  const runner = options.rstestRunner ?? runRstestProject;
  const exitCode = await runner({
    project,
    cwd: projectDir,
    stdio: options.stdio,
  });

  const cases = project.cases
    .map((item) => readCaseResult(item))
    .filter((result): result is CaseResult => result !== undefined);

  const summary = summarizeCases(cases, startedAt, new Date());
  writeSummaryFile(config, projectDir, summary);

  return { summary, exitCode };
}
