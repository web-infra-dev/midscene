import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrateLegacyYamlProject } from '../migration/legacy-yaml';
import { renderNodeReference } from './node-reference';
import { loadTestProject } from './test-project';
import { discoverTestConfig, runTestProject } from './test-project-runner';

export interface TestCliIO {
  log(message: string): void;
  error(message: string): void;
  write?(message: string): void;
}

interface ParsedTestArgs {
  command?: 'describe-nodes' | 'migrate';
  cwd: string;
  projectRoot?: string;
  configPath?: string;
  resultDir?: string;
  projectNames?: string[];
  migrationSource?: string;
  migrationOutputDir?: string;
}

export const parseTestCliArgs = (
  args: string[],
  cwd = process.cwd(),
): ParsedTestArgs => {
  const command =
    args[0] === 'describe-nodes' || args[0] === 'migrate' ? args[0] : undefined;
  const commandOffset = command ? 1 : 0;
  let projectRoot: string | undefined;
  let configPath: string | undefined;
  let resultDir: string | undefined;
  let migrationOutputDir: string | undefined;
  const projectNames: string[] = [];

  for (let index = commandOffset; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('-')) {
      if (projectRoot)
        throw new Error(
          command === 'migrate'
            ? 'Only one legacy YAML source is allowed.'
            : 'Only one test project directory is allowed.',
        );
      projectRoot = resolve(cwd, arg);
      continue;
    }
    if (
      arg === '--config' ||
      arg === '--result-dir' ||
      arg === '--project' ||
      arg === '--output-dir'
    ) {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      if (arg === '--config') configPath = value;
      else if (arg === '--result-dir') resultDir = resolve(cwd, value);
      else if (arg === '--output-dir') migrationOutputDir = resolve(cwd, value);
      else projectNames.push(value);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (command === 'describe-nodes' && resultDir) {
    throw new Error('--result-dir is not supported by describe-nodes.');
  }
  if (command === 'describe-nodes' && projectNames.length > 0) {
    throw new Error('--project is not supported by describe-nodes.');
  }
  if (command !== 'migrate' && migrationOutputDir) {
    throw new Error('--output-dir is only supported by migrate.');
  }
  if (command === 'migrate') {
    if (!projectRoot) {
      throw new Error(
        'migrate requires a legacy YAML file or directory as its source.',
      );
    }
    if (!migrationOutputDir) {
      throw new Error('migrate requires --output-dir <directory>.');
    }
    if (configPath) throw new Error('--config is not supported by migrate.');
    if (resultDir) throw new Error('--result-dir is not supported by migrate.');
    if (projectNames.length > 0) {
      throw new Error('--project is not supported by migrate.');
    }
    return {
      command,
      cwd,
      migrationSource: projectRoot,
      migrationOutputDir,
    };
  }

  return {
    ...(command ? { command } : {}),
    cwd,
    projectRoot,
    configPath,
    resultDir,
    ...(projectNames.length > 0 ? { projectNames } : {}),
  };
};

const defaultCliIO: TestCliIO = {
  log: console.log,
  error: console.error,
  write: (message) => process.stdout.write(message),
};

const assertDirectory = (path: string, label: string): void => {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${path}`);
  }
};

const describeNodes = async (
  options: ParsedTestArgs,
  io: TestCliIO,
): Promise<void> => {
  const cwd = resolve(options.cwd);
  assertDirectory(cwd, 'Test working directory');
  const projectRoot = options.projectRoot
    ? resolve(cwd, options.projectRoot)
    : undefined;
  if (projectRoot) assertDirectory(projectRoot, 'Test project directory');

  const configSearchRoot = projectRoot ?? cwd;
  const configPath = options.configPath
    ? resolve(configSearchRoot, options.configPath)
    : discoverTestConfig(configSearchRoot);
  if (options.configPath && (!configPath || !existsSync(configPath))) {
    throw new Error(`Midscene config does not exist: ${configPath}`);
  }

  const project = await loadTestProject(configPath);
  const document = renderNodeReference(project.nodes.definitions());
  for (const warning of document.warnings) {
    io.error(`midscene-test describe-nodes: ${warning}`);
  }
  if (io.write) io.write(document.markdown);
  else io.log(document.markdown.trimEnd());
};

export async function runTestCli(
  args: string[],
  io: TestCliIO = defaultCliIO,
): Promise<number> {
  try {
    const options = parseTestCliArgs(args);
    if (options.command === 'describe-nodes') {
      await describeNodes(options, io);
      return 0;
    }
    if (options.command === 'migrate') {
      const result = migrateLegacyYamlProject({
        source: options.migrationSource!,
        outputDir: options.migrationOutputDir!,
      });
      io.log(
        `midscene-test migrate: converted ${result.workflowPaths.length} legacy YAML file${result.workflowPaths.length === 1 ? '' : 's'}`,
      );
      io.log(`Config: ${result.configPath}`);
      io.log(`Migration report: ${result.reportPath}`);
      for (const warning of result.warnings) {
        io.error(`midscene-test migrate: ${warning}`);
      }
      return 0;
    }
    const result = await runTestProject({
      ...options,
      onProgress: (message) => io.log(message),
    });
    io.log(
      `midscene-test: ${result.summary.passed}/${result.summary.total} cases passed, ${result.summary.failed} failed, ${result.summary.notRun} not run`,
    );
    io.log(`Results: ${result.resultDir}`);
    io.log(`Summary: ${result.summaryPath}`);
    return result.exitCode;
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
