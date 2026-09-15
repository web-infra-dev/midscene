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
  paths?: string[];
  caseIds?: string[];
  tags?: { include?: string[]; exclude?: string[] };
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
  const paths: string[] = [];
  const caseIds: string[] = [];
  const includeTags: string[] = [];
  const excludeTags: string[] = [];

  for (let index = commandOffset; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('-')) {
      if (projectRoot)
        throw new Error('Only one test project directory is allowed.');
      projectRoot = resolve(cwd, arg);
      continue;
    }
    if (
      arg === '--config' ||
      arg === '--result-dir' ||
      arg === '--project' ||
      arg === '--file' ||
      arg === '--case-id' ||
      arg === '--tag' ||
      arg === '--exclude-tag'
    ) {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      if (arg === '--config') configPath = value;
      else if (arg === '--result-dir') resultDir = resolve(cwd, value);
      else if (arg === '--project') projectNames.push(value);
      else if (arg === '--file') paths.push(value);
      else if (arg === '--case-id') caseIds.push(value);
      else if (arg === '--tag') includeTags.push(value);
      else excludeTags.push(value);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (command === 'nodes' && resultDir) {
    throw new Error('--result-dir is not supported by nodes.');
  }
  if (command === 'nodes' && projectNames.length > 1) {
    throw new Error('nodes accepts only one --project name.');
  }
  if (
    command === 'nodes' &&
    (paths.length > 0 ||
      caseIds.length > 0 ||
      includeTags.length > 0 ||
      excludeTags.length > 0)
  ) {
    throw new Error(
      'nodes does not support --file, --case-id, --tag, or --exclude-tag.',
    );
  }

  return {
    ...(command ? { command } : {}),
    cwd,
    projectRoot,
    configPath,
    resultDir,
    ...(projectNames.length > 0 ? { projectNames } : {}),
    ...(paths.length > 0 ? { paths } : {}),
    ...(caseIds.length > 0 ? { caseIds } : {}),
    ...(includeTags.length > 0 || excludeTags.length > 0
      ? {
          tags: {
            ...(includeTags.length > 0 ? { include: includeTags } : {}),
            ...(excludeTags.length > 0 ? { exclude: excludeTags } : {}),
          },
        }
      : {}),
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
