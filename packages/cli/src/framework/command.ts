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
  type CreateRstestYamlProjectOptions,
  type GeneratedRstestYamlProject,
  createRstestYamlProject,
} from './rstest-project';
import { runRstestYamlProject } from './rstest-runner';

export interface FrameworkTestCommandOptions {
  projectDir?: string;
  files?: string[];
  concurrent?: number;
  headed?: boolean;
  keepWindow?: boolean;
  outputDir?: string;
  frameworkImport?: string;
  stdio?: 'inherit' | 'pipe';
  rstestRunner?: typeof runRstestYamlProject;
}

const createCaseOptions = (
  config: BatchRunnerConfig,
): CreateRstestYamlProjectOptions['caseOptions'] => {
  const caseOptions: CreateRstestYamlProjectOptions['caseOptions'] = {};
  for (const file of config.files) {
    caseOptions[resolve(file)] = {
      globalConfig: config.globalConfig,
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

const splitProjectByConcurrency = (
  project: GeneratedRstestYamlProject,
): GeneratedRstestYamlProject[] => {
  if (
    project.include.length === 1 ||
    project.maxConcurrency === undefined ||
    project.maxConcurrency <= 0 ||
    project.cases.length <= project.maxConcurrency
  ) {
    return [project];
  }

  const chunks: GeneratedRstestYamlProject[] = [];
  for (let i = 0; i < project.cases.length; i += project.maxConcurrency) {
    const cases = project.cases.slice(i, i + project.maxConcurrency);
    const include = cases.map((item) => item.testModule);
    chunks.push({
      ...project,
      include,
      virtualModules: Object.fromEntries(
        include.map((entry) => [entry, project.virtualModules[entry]]),
      ),
      cases,
    });
  }

  return chunks;
};

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
    headed: commandOptions.headed ?? config.headed,
    keepWindow: commandOptions.keepWindow ?? config.keepWindow,
    maxConcurrency: commandOptions.concurrent ?? config.concurrent,
    bail: config.continueOnError ? 0 : 1,
    batchConfig: config.shareBrowserContext ? config : undefined,
  });

  const runner = commandOptions.rstestRunner || runRstestYamlProject;
  let exitCode = 0;
  for (const projectBatch of splitProjectByConcurrency(project)) {
    const batchExitCode = await runner({
      project: projectBatch,
      cwd: projectDir,
      stdio: commandOptions.stdio,
    });
    if (batchExitCode !== 0) {
      exitCode = batchExitCode;
      if (!config.continueOnError) {
        break;
      }
    }
  }

  const results = readProjectResults(project);
  const summaryPath = writeExecutionSummaryFile(config.summary, results);
  printExecutionFinished();
  const success = printExecutionSummary(results, summaryPath);

  return success ? exitCode : 1;
}
