import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import type { BatchRunnerConfig } from '../batch-runner';
import {
  createNotExecutedYamlResult,
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

export interface FrameworkTestCommandOptions extends WebRuntimeOptions {
  projectDir?: string;
  files?: string[];
  concurrent?: number;
  outputDir?: string;
  frameworkImport?: string;
  stdio?: 'inherit' | 'pipe';
  rstestRunner?: typeof runRstestYamlProject;
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

export async function runFrameworkTestConfig(
  config: BatchRunnerConfig,
  commandOptions: FrameworkTestCommandOptions = {},
): Promise<number> {
  printExecutionPlan(config);

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
    batchConfig: config.shareBrowserContext ? config : undefined,
  });

  const runner = commandOptions.rstestRunner || runRstestYamlProject;
  const exitCode = await runner({
    project,
    cwd: projectDir,
    stdio: commandOptions.stdio,
  });

  const results = readProjectResults(project);
  const summaryPath = writeExecutionSummaryFile(config.summary, results);
  printExecutionFinished();
  const success = printExecutionSummary(results, summaryPath);

  return success ? exitCode : 1;
}
