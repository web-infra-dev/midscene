import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { NativeWorkflowFormatError } from '../parser/collect';
import type {
  PreparedExecutionProject,
  PreparedTestRunPlan,
  TestProjectRunOptions,
  TestRunInput,
} from './execution-plan';
import {
  discoverTestConfig,
  prepareProject,
  selectProjects,
} from './project-preparation';
import { loadTestProject } from './test-project';

const padDatePart = (value: number): string => String(value).padStart(2, '0');

export const createTestRunId = (
  date = new Date(),
  uuid = randomUUID(),
): string => {
  const timestamp = [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
    padDatePart(date.getHours()),
    padDatePart(date.getMinutes()),
    padDatePart(date.getSeconds()),
  ].join('');
  return `${timestamp}-${uuid.slice(0, 8)}`;
};

const assertDirectory = (path: string, label: string): void => {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${path}`);
  }
};

const resolveRunInput = (options: TestProjectRunOptions): TestRunInput => {
  const cwd = resolve(options.cwd ?? process.cwd());
  assertDirectory(cwd, 'Test working directory');
  const inputPath = options.projectRoot
    ? resolve(cwd, options.projectRoot)
    : undefined;
  const singleFile =
    inputPath && existsSync(inputPath) && statSync(inputPath).isFile()
      ? inputPath
      : undefined;
  if (singleFile && !/\.ya?ml$/i.test(singleFile))
    throw new Error(
      `Test input must be a YAML file or project directory: ${singleFile}`,
    );
  const cliProjectRoot = singleFile ? dirname(singleFile) : inputPath;
  if (cliProjectRoot) assertDirectory(cliProjectRoot, 'Test project directory');
  const projectRoot = cliProjectRoot ?? cwd;
  return {
    cwd,
    projectRoot,
    configSearchRoot: projectRoot,
    ...(singleFile ? { singleFile } : {}),
  };
};

const findProjectRoot = (
  configPath: string | undefined,
  fallback: string,
  cwd: string,
  explicitConfig: boolean,
): string => {
  if (explicitConfig) return fallback;
  if (configPath) return dirname(configPath);
  if (fallback === cwd) return cwd;
  return fallback;
};

/** Composition boundary only: execution receives no raw input syntax or host options. */
export async function prepareTestRun(
  options: TestProjectRunOptions,
): Promise<PreparedTestRunPlan> {
  const startedAt = new Date();
  const runId = createTestRunId(startedAt);
  const input = resolveRunInput(options);
  const configPath = options.configPath
    ? resolve(input.configSearchRoot, options.configPath)
    : discoverTestConfig(input.configSearchRoot);
  if (options.configPath && /\.ya?ml$/i.test(configPath!)) {
    throw new Error(
      `midscene-test --config only accepts a native TypeScript or JavaScript project config: ${configPath}. Run legacy batch YAML with \`midscene --config ${options.configPath}\`.`,
    );
  }
  if (options.configPath && !existsSync(configPath!))
    throw new Error(`Midscene config does not exist: ${configPath}`);
  const projectRoot = findProjectRoot(
    configPath,
    input.projectRoot,
    input.cwd,
    Boolean(options.configPath),
  );
  const definition = await loadTestProject<unknown>(configPath);
  const resultDir = options.resultDir
    ? resolve(input.cwd, options.resultDir)
    : join(projectRoot, '.midscene', 'test-results');
  const runDir = join(resultDir, runId);
  const summaryPath = join(runDir, 'summary.json');
  const reportDir = resolve(projectRoot, definition.output.reportDir);
  mkdirSync(resultDir, { recursive: true });
  mkdirSync(runDir);
  const projects: PreparedExecutionProject[] = [];
  const files = input.singleFile ? [input.singleFile] : undefined;
  const prepOptions = files ? { files } : undefined;
  for (const project of selectProjects(
    definition.projects,
    options.projectNames,
  ))
    projects.push(
      await prepareProject(
        project,
        projectRoot,
        runDir,
        definition.test.testTimeout,
        prepOptions,
      ),
    );
  const hasFormatMismatch = projects.some((project) =>
    project.collectionErrors.some(
      ({ error }) => error instanceof NativeWorkflowFormatError,
    ),
  );
  return {
    startedAt,
    runId,
    projectRoot,
    ...(configPath ? { configPath } : {}),
    resultDir,
    runDir,
    summaryPath,
    reportDir,
    definition,
    projects,
    preflightScope: hasFormatMismatch ? 'run' : 'project',
    reportEnabled: true,
    publications: [],
    onProgress: options.onProgress ?? (() => {}),
  };
}
