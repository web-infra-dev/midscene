import { existsSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { renderNodeReference, sortNodesForReference } from './node-reference';
import { loadTestProject } from './test-project';
import {
  DEFAULT_TEST_FILE_SELECTION,
  discoverTestConfig,
  runTestProject,
} from './test-project-runner';

export interface TestCliIO {
  log(message: string): void;
  error(message: string): void;
  write?(message: string): void;
}

interface ParsedTestArgs {
  command?: 'nodes';
  cwd: string;
  projectRoot?: string;
  configPath?: string;
  resultDir?: string;
  projectNames?: string[];
}

export const parseTestCliArgs = (
  args: string[],
  cwd = process.cwd(),
): ParsedTestArgs => {
  const command = args[0] === 'nodes' ? args[0] : undefined;
  const commandOffset = command ? 1 : 0;
  let projectRoot: string | undefined;
  let configPath: string | undefined;
  let resultDir: string | undefined;
  const projectNames: string[] = [];

  for (let index = commandOffset; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('-')) {
      if (projectRoot)
        throw new Error('Only one test project directory is allowed.');
      projectRoot = resolve(cwd, arg);
      continue;
    }
    if (arg === '--config' || arg === '--result-dir' || arg === '--project') {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      if (arg === '--config') configPath = value;
      else if (arg === '--result-dir') resultDir = resolve(cwd, value);
      else projectNames.push(value);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (command === 'nodes' && resultDir) {
    throw new Error('--result-dir is not supported by nodes.');
  }
  if (command === 'nodes' && projectNames.length > 0) {
    throw new Error('--project is not supported by nodes.');
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

const runNodesCommand = async (
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
  const nodes = sortNodesForReference(project.nodes.definitions());
  const document = renderNodeReference(nodes, {
    configPath: configPath
      ? relative(configSearchRoot, configPath).split(sep).join('/')
      : undefined,
    projects: project.projects.map((executionProject) => ({
      name: executionProject.name,
      files: executionProject.files ?? DEFAULT_TEST_FILE_SELECTION,
    })),
  });
  for (const warning of document.warnings) {
    io.error(`midscene-test nodes: ${warning}`);
  }
  const referencePath = resolve(configSearchRoot, 'midscene-node-reference.md');
  writeFileSync(referencePath, document.markdown);
  io.log(`Registered Nodes (${nodes.length}):`);
  if (nodes.length === 0) {
    io.log('No nodes are registered by the current Test Project.');
  }
  for (const node of nodes) {
    io.log(
      `- ${node.name}: ${node.description?.trim() || 'Description not declared.'}`,
    );
  }
  io.log(`\nNode reference generated: ${referencePath}`);
};

export async function runTestCli(
  args: string[],
  io: TestCliIO = defaultCliIO,
): Promise<number> {
  try {
    if (args[0] === 'create') {
      const { runCreateCommand } = await import('./create-command');
      await runCreateCommand(args.slice(1), io);
      return 0;
    }
    const options = parseTestCliArgs(args);
    if (options.command === 'nodes') {
      await runNodesCommand(options, io);
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
    if (result.reportPath) io.log(`Report: ${result.reportPath}`);
    return result.exitCode;
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
