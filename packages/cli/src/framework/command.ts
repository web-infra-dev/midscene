import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import type { BatchRunnerConfig } from '../batch-runner';
import { matchYamlFiles } from '../cli-utils';
import {
  type CreateRstestYamlProjectOptions,
  type GeneratedRstestYamlProject,
  createRstestYamlProject,
} from './rstest-project';
import { runRstestCli } from './rstest-runner';

export interface FrameworkTestCommandOptions {
  projectDir?: string;
  files?: string[];
  concurrent?: number;
  headed?: boolean;
  keepWindow?: boolean;
  outputDir?: string;
  frameworkImport?: string;
  stdio?: 'inherit' | 'pipe';
  rstestRunner?: typeof runRstestCli;
}

interface ParsedFrameworkArgs {
  path?: string;
  files?: string[];
  concurrent?: number;
  headed?: boolean;
  keepWindow?: boolean;
}

const parseFrameworkTestArgs = (args: string[]): ParsedFrameworkArgs => {
  const parsed: ParsedFrameworkArgs = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--files') {
      parsed.files = [];
      while (args[index + 1] && !args[index + 1].startsWith('--')) {
        parsed.files.push(args[++index]);
      }
      continue;
    }
    if (arg === '--concurrent') {
      const value = args[++index];
      const concurrent = Number.parseInt(value, 10);
      if (!Number.isFinite(concurrent) || concurrent <= 0) {
        throw new Error(`--concurrent must be a positive number, got ${value}`);
      }
      parsed.concurrent = concurrent;
      continue;
    }
    if (arg === '--headed') {
      parsed.headed = true;
      continue;
    }
    if (arg === '--keep-window') {
      parsed.keepWindow = true;
      parsed.headed = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown midscene test option: ${arg}`);
    }
    if (!parsed.path) {
      parsed.path = arg;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  return parsed;
};

const resolveYamlFiles = async (
  options: FrameworkTestCommandOptions,
): Promise<string[]> => {
  const patterns =
    options.files && options.files.length > 0
      ? options.files
      : [options.projectDir || '.'];

  const files: string[] = [];
  for (const pattern of patterns) {
    const matched = await matchYamlFiles(pattern, {
      cwd: options.projectDir ? resolve(options.projectDir) : undefined,
    });
    files.push(...matched);
  }

  return files;
};

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

const getSummaryAbsolutePath = (summary: string): string =>
  resolve(getMidsceneRunSubDir('output'), summary);

const readProjectResults = (
  project: GeneratedRstestYamlProject,
): MidsceneYamlConfigResult[] =>
  project.cases.map((item) => {
    if (existsSync(item.resultFile)) {
      return JSON.parse(
        readFileSync(item.resultFile, 'utf8'),
      ) as MidsceneYamlConfigResult;
    }

    return {
      file: item.yamlFile,
      success: false,
      executed: false,
      output: undefined,
      report: undefined,
      duration: 0,
      resultType: 'notExecuted',
      error: 'Not executed',
    };
  });

const writeSummaryFile = (
  summary: string,
  results: MidsceneYamlConfigResult[],
): string => {
  const indexPath = getSummaryAbsolutePath(summary);
  const outputDir = dirname(indexPath);
  mkdirSync(outputDir, { recursive: true });

  const indexData = {
    summary: {
      total: results.length,
      successful: results.filter((r) => r.resultType === 'success').length,
      failed: results.filter((r) => r.resultType === 'failed').length,
      partialFailed: results.filter((r) => r.resultType === 'partialFailed')
        .length,
      notExecuted: results.filter((r) => r.resultType === 'notExecuted').length,
      totalDuration: results.reduce((sum, r) => sum + (r.duration || 0), 0),
      generatedAt: new Date().toLocaleString(),
    },
    results: results.map((result) => ({
      script: relative(outputDir, result.file),
      success: result.success,
      resultType: result.resultType,
      output: result.output
        ? (() => {
            const relativePath = relative(outputDir, result.output);
            return relativePath.startsWith('.')
              ? relativePath
              : `./${relativePath}`;
          })()
        : undefined,
      report: result.report ? relative(outputDir, result.report) : undefined,
      error: result.error,
      duration: result.duration,
    })),
  };

  writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
  return indexPath;
};

const printExecutionPlan = (config: BatchRunnerConfig): void => {
  console.log('   Scripts:');
  for (const file of config.files) {
    console.log(`     - ${file}`);
  }
  console.log('📋 Execution plan');
  console.log(`   Concurrency: ${config.concurrent}`);
  console.log(`   Keep window: ${config.keepWindow}`);
  console.log(`   Headed: ${config.headed}`);
  console.log(`   Continue on error: ${config.continueOnError}`);
  console.log(
    `   Share browser context: ${config.shareBrowserContext ?? false}`,
  );
  console.log(`   Summary output: ${config.summary}`);
};

const printExecutionSummary = (
  results: MidsceneYamlConfigResult[],
  summaryPath: string,
): boolean => {
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  const successfulFiles = results.filter((r) => r.resultType === 'success');
  const failedFiles = results.filter((r) => r.resultType === 'failed');
  const partialFailedFiles = results.filter(
    (r) => r.resultType === 'partialFailed',
  );
  const notExecutedFiles = results.filter(
    (r) => r.resultType === 'notExecuted',
  );
  const success =
    failedFiles.length === 0 &&
    partialFailedFiles.length === 0 &&
    notExecutedFiles.length === 0;

  console.log('\n📊 Execution Summary:');
  console.log(`   Total files: ${results.length}`);
  console.log(`   Successful: ${successfulFiles.length}`);
  console.log(`   Failed: ${failedFiles.length}`);
  console.log(`   Partial failed: ${partialFailedFiles.length}`);
  console.log(`   Not executed: ${notExecutedFiles.length}`);
  console.log(`   Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`   Summary: ${summaryPath}`);

  if (successfulFiles.length > 0) {
    console.log('\n✅ Successful files:');
    successfulFiles.forEach((result) => {
      console.log(`   ${result.file}`);
    });
  }

  if (failedFiles.length > 0) {
    console.log('\n❌ Failed files');
    failedFiles.forEach((result) => {
      console.log(`   ${result.file}`);
    });
  }

  if (partialFailedFiles.length > 0) {
    console.log('\n⚠️  Partial failed files (some tasks failed)');
    partialFailedFiles.forEach((result) => {
      console.log(`   ${result.file}`);
    });
  }

  if (notExecutedFiles.length > 0) {
    console.log('\n⏸️ Not executed files');
    notExecutedFiles.forEach((result) => {
      console.log(`   ${result.file}`);
    });
  }

  if (success) {
    console.log('\n🎉 All files executed successfully!');
  } else {
    console.log('\n⚠️ Some files failed or were not executed.');
  }

  return success;
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
  });

  const runner = commandOptions.rstestRunner || runRstestCli;
  const exitCode = await runner({
    configFile: project.configFile,
    cwd: projectDir,
    stdio: commandOptions.stdio,
  });

  const results = readProjectResults(project);
  const summaryPath = writeSummaryFile(config.summary, results);
  console.log('Execution finished:');
  const success = printExecutionSummary(results, summaryPath);

  return success ? exitCode : 1;
}

export async function runFrameworkTestCommand(
  rawArgs: string[],
  commandOptions: FrameworkTestCommandOptions = {},
): Promise<number> {
  const parsed = parseFrameworkTestArgs(rawArgs);
  const projectDir = resolve(
    commandOptions.projectDir || parsed.path || process.cwd(),
  );

  if (!existsSync(projectDir)) {
    throw new Error(`Project path does not exist: ${projectDir}`);
  }

  const files = await resolveYamlFiles({
    projectDir,
    files: commandOptions.files || parsed.files,
  });

  if (files.length === 0) {
    throw new Error(`No yaml files found in ${projectDir}`);
  }

  const projectOptions: CreateRstestYamlProjectOptions = {
    files,
    projectDir,
    outputDir: commandOptions.outputDir,
    frameworkImport: commandOptions.frameworkImport,
    headed: commandOptions.headed ?? parsed.headed,
    keepWindow: commandOptions.keepWindow ?? parsed.keepWindow,
    maxConcurrency: commandOptions.concurrent ?? parsed.concurrent ?? 1,
  };
  const project = createRstestYamlProject(projectOptions);

  const runner = commandOptions.rstestRunner || runRstestCli;
  return runner({
    configFile: project.configFile,
    cwd: projectDir,
    stdio: commandOptions.stdio,
  });
}
