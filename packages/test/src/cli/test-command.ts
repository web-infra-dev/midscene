import { existsSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { version } from '../../package.json';
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
    const token = args[index];
    const equal = token.startsWith('-') ? token.indexOf('=') : -1;
    const arg = equal < 0 ? token : token.slice(0, equal);
    const inlineValue = equal < 0 ? undefined : token.slice(equal + 1);
    if (!arg.startsWith('-')) {
      if (projectRoot)
        throw new Error('Only one test project directory is allowed.');
      projectRoot = resolve(cwd, arg);
      continue;
    }
    if (arg === '--config' || arg === '--result-dir' || arg === '--project') {
      const value = inlineValue ?? args[index + 1];
      if (!value || value.startsWith('--'))
        throw new Error(`${arg} requires a value.`);
      if (arg === '--config') configPath = value;
      else if (arg === '--result-dir') resultDir = resolve(cwd, value);
      else projectNames.push(value);
      if (inlineValue === undefined) index += 1;
    } else {
      throw new Error(`Unknown option: ${token}`);
    }
  }

  if (command === 'nodes' && resultDir) {
    throw new Error('--result-dir is not supported by nodes.');
  }
  if (command === 'nodes' && projectNames.length > 1) {
    throw new Error('nodes accepts only one --project name.');
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

const testCliHelp = `Midscene Test: run native cases/steps Test projects.

Usage:
  midscene-test [file.yaml | directory] [options]
  midscene-test --config <midscene.config.ts> [options]
  midscene-test nodes [directory] [--config midscene.config.ts]
  midscene-test create --help

Options:
  --config <path>              Native TypeScript or JavaScript Test config
  --project <name>             Select a native execution Project (repeatable)
  --result-dir <path>          Store Test result files in this directory
  --help, -h                  Show this help
  --version                   Show the package version

Legacy tasks/flow YAML and its CLI options belong to the midscene command.
`;

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
  if (options.configPath && /\.ya?ml$/i.test(configPath!)) {
    throw new Error(
      `midscene-test nodes --config only accepts a native TypeScript or JavaScript project config: ${configPath}.`,
    );
  }
  if (options.configPath && (!configPath || !existsSync(configPath))) {
    throw new Error(`Midscene config does not exist: ${configPath}`);
  }

  const project = await loadTestProject(configPath);
  const projectName = options.projectNames?.[0];
  const selectedProjects = projectName
    ? project.projects.filter((candidate) => candidate.name === projectName)
    : project.projects;
  if (selectedProjects.length === 0) {
    throw new Error(`Unknown Midscene project: ${projectName}`);
  }
  const registry = selectedProjects[0].nodes;
  if (
    selectedProjects.some(
      (candidate) =>
        candidate.nodes.names().length !== registry.names().length ||
        candidate.nodes
          .definitions()
          .some((node) => registry.get(node.name) !== node),
    )
  ) {
    throw new Error(
      'Projects have different Nodes. Use nodes --project <name> to select one.',
    );
  }
  const nodes = sortNodesForReference(registry.definitions());
  const document = renderNodeReference(nodes, {
    configPath: configPath
      ? relative(configSearchRoot, configPath).split(sep).join('/')
      : undefined,
    projects: selectedProjects.map((executionProject) => ({
      name: executionProject.name,
      files: executionProject.files ?? DEFAULT_TEST_FILE_SELECTION,
    })),
  });
  for (const warning of document.warnings) {
    io.error(`midscene-test nodes: ${warning}`);
  }
  const referencePath = resolve(configSearchRoot, 'midscene-node-reference.md');
  writeFileSync(referencePath, document.markdown);
  if (projectName) io.log(`Execution Project: ${projectName}`);
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
    if (args.includes('--help') || args.includes('-h')) {
      io.log(testCliHelp);
      return 0;
    }
    if (args.includes('--version')) {
      io.log(version);
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
    for (const failure of result.collectionErrors) {
      io.error(
        `midscene-test: ${failure.projectName}/${failure.sourcePath}: ${failure.error.message}`,
      );
    }
    const finalCases = new Map(
      result.cases.map((outcome) => [outcome.caseId, outcome]),
    );
    for (const outcome of finalCases.values()) {
      if (outcome.status !== 'failed' || !outcome.run) continue;
      const run = outcome.run;
      const source = `${run.projectName}/${run.sourcePath} / ${run.name}`;
      for (const step of [...run.beforeEach, ...run.steps, ...run.afterEach]) {
        if (step.error) {
          io.error(
            `midscene-test: ${source} / ${step.phase}[${step.stepIndex + 1}] ${step.node}: ${step.error.message}`,
          );
        }
      }
      for (const error of [
        ...(run.executionErrors ?? []),
        ...(run.teardownErrors ?? []),
      ]) {
        io.error(`midscene-test: ${source}: ${error.message}`);
      }
    }
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
