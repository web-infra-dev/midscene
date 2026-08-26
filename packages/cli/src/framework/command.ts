import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import { BatchRunner, type BatchRunnerConfig } from '../batch-runner';
import {
  createNotExecutedYamlResult,
  getExecutionSummary,
  getSummaryAbsolutePath,
  isExecutionSummarySuccessful,
  printExecutionFinished,
  printExecutionPlan,
  printExecutionSummary,
  writeExecutionSummaryFile,
} from '../execution-summary';
import {
  type GeneratedRstestYamlProject,
  type RstestYamlCaseOptions,
  type WebYamlRuntimeOptions,
  createRstestYamlProject,
} from './rstest-project';
import { runRstestYamlProject } from './rstest-runner';

interface WebRuntimeOptions {
  headed?: boolean;
  keepWindow?: boolean;
}

export const JSON_KEEP_WINDOW_ERROR =
  'JSON output mode cannot be used when keepWindow is enabled because the command does not terminate.';

export interface FrameworkTestCommandOptions extends WebRuntimeOptions {
  projectDir?: string;
  files?: string[];
  concurrent?: number;
  outputDir?: string;
  frameworkImport?: string;
  stdio?: 'inherit' | 'pipe';
  rstestRunner?: typeof runRstestYamlProject;
  /**
   * In-process executor used for the `keepWindow` path. Injectable so tests can
   * exercise the routing without launching a real browser. Defaults to the
   * legacy {@link BatchRunner}.
   */
  inProcessRunner?: (
    config: BatchRunnerConfig,
  ) => Promise<MidsceneYamlConfigResult[]>;
}

type FrameworkTestCommandDetailedOptions = FrameworkTestCommandOptions & {
  outputMode?: 'human' | 'json';
};

export interface FrameworkTestCommandResult {
  exitCode: number;
  results: MidsceneYamlConfigResult[];
  summaryPath: string;
}

const defaultInProcessRunner = (
  config: BatchRunnerConfig,
): Promise<MidsceneYamlConfigResult[]> => new BatchRunner(config).run();

// `keepWindow` keeps the browser open after the run finishes, which is only
// possible when the browser is owned by this long-lived CLI process. The Rstest
// framework runs each case in a disposable worker whose teardown kills the
// browser, so route keepWindow (a debug-only flow) through the in-process batch
// executor instead. It owns the browser in this process and renders the live
// per-step progress that the Rstest path does not surface — the two reasons to
// pass --keep-window in the first place.
async function runConfigInMainProcess(
  config: BatchRunnerConfig,
  commandOptions: FrameworkTestCommandDetailedOptions,
): Promise<FrameworkTestCommandResult> {
  const runner = commandOptions.inProcessRunner ?? defaultInProcessRunner;
  const results = await runner(config);
  const summaryPath = getSummaryAbsolutePath(config.summary);
  const success = printExecutionSummary(results, summaryPath);
  return {
    exitCode: success ? 0 : 1,
    results,
    summaryPath,
  };
}

const createCaseOptions = (
  config: BatchRunnerConfig,
): Record<string, RstestYamlCaseOptions> => {
  const caseOptions: Record<string, RstestYamlCaseOptions> = {};
  for (const file of config.files) {
    caseOptions[resolve(file)] = {
      globalConfig: config.globalConfig,
    };
  }
  return caseOptions;
};

const createWebRuntimeOptions = (
  config: BatchRunnerConfig,
  runtimeOptions: WebRuntimeOptions,
): Record<string, WebYamlRuntimeOptions> => {
  const caseOptions: Record<string, WebYamlRuntimeOptions> = {};
  for (const file of config.files) {
    caseOptions[resolve(file)] = {
      headed: runtimeOptions.headed ?? config.headed,
      keepWindow: runtimeOptions.keepWindow ?? config.keepWindow,
    };
  }
  return caseOptions;
};

const readProjectResults = (
  project: GeneratedRstestYamlProject,
): MidsceneYamlConfigResult[] =>
  project.cases.map((item) => {
    if (existsSync(item.resultFile)) {
      return JSON.parse(
        readFileSync(item.resultFile, 'utf8'),
      ) as MidsceneYamlConfigResult;
    }

    return createNotExecutedYamlResult(item.yamlFile);
  });

export async function runFrameworkTestConfigDetailed(
  config: BatchRunnerConfig,
  commandOptions: FrameworkTestCommandDetailedOptions = {},
): Promise<FrameworkTestCommandResult> {
  if (config.keepWindow && commandOptions.outputMode === 'json') {
    throw new Error(JSON_KEEP_WINDOW_ERROR);
  }

  if (config.keepWindow) {
    return runConfigInMainProcess(config, commandOptions);
  }

  const shouldPrintHumanOutput = commandOptions.outputMode !== 'json';
  if (shouldPrintHumanOutput) {
    printExecutionPlan(config);
  }

  const projectDir = resolve(commandOptions.projectDir || process.cwd());
  const project = createRstestYamlProject({
    files: config.files,
    projectDir,
    outputDir: commandOptions.outputDir,
    frameworkImport: commandOptions.frameworkImport,
    caseOptions: createCaseOptions(config),
    webRuntimeOptions: createWebRuntimeOptions(config, commandOptions),
    maxConcurrency: commandOptions.concurrent ?? config.concurrent,
    bail: config.continueOnError ? 0 : 1,
    retry: config.retry,
    // setup requires one orchestrated batch even when its target does not use
    // a shared Puppeteer BrowserContext (for example Android or Computer).
    batchConfig:
      config.shareBrowserContext || config.setup ? config : undefined,
  });

  const runner = commandOptions.rstestRunner || runRstestYamlProject;
  const exitCode = await runner({
    project,
    cwd: projectDir,
    stdio: commandOptions.outputMode === 'json' ? 'pipe' : commandOptions.stdio,
  });

  const results = readProjectResults(project);
  const summaryPath = writeExecutionSummaryFile(config.summary, results);
  let success: boolean;
  if (shouldPrintHumanOutput) {
    printExecutionFinished();
    success = printExecutionSummary(results, summaryPath);
  } else {
    success = isExecutionSummarySuccessful(getExecutionSummary(results));
  }

  return {
    exitCode: success ? exitCode : 1,
    results,
    summaryPath,
  };
}

export async function runFrameworkTestConfig(
  config: BatchRunnerConfig,
  commandOptions: FrameworkTestCommandOptions = {},
): Promise<number> {
  const result = await runFrameworkTestConfigDetailed(config, commandOptions);
  return result.exitCode;
}
