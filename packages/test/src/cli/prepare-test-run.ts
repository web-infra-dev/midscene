import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
import {
  type YamlCompatibilityRunOptions,
  prepareYamlCompatibility,
} from './yaml-compatibility';

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
  const filePattern =
    inputPath && !existsSync(inputPath) && /[*?{}[\]]/.test(inputPath)
      ? inputPath
      : undefined;
  const cliProjectRoot = singleFile ? dirname(singleFile) : inputPath;
  if (cliProjectRoot && !filePattern)
    assertDirectory(cliProjectRoot, 'Test project directory');
  const projectRoot = filePattern ? cwd : (cliProjectRoot ?? cwd);
  return {
    cwd,
    projectRoot,
    configSearchRoot: projectRoot,
    ...(singleFile ? { singleFile } : {}),
    ...(filePattern ? { filePattern } : {}),
  };
};

/** Composition boundary only: execution receives no raw input syntax or host options. */
export async function prepareTestRun(
  options: TestProjectRunOptions,
  compatibility?: YamlCompatibilityRunOptions,
): Promise<PreparedTestRunPlan> {
  const startedAt = new Date();
  const runId = createTestRunId(startedAt);
  const input = resolveRunInput(options);
  const adapter = await prepareYamlCompatibility(input, options, compatibility);
  const configPath = adapter.usesDefaultConfiguration
    ? undefined
    : options.configPath
      ? resolve(input.configSearchRoot, options.configPath)
      : discoverTestConfig(input.configSearchRoot);
  if (
    !adapter.usesDefaultConfiguration &&
    options.configPath &&
    !existsSync(configPath!)
  )
    throw new Error(`Midscene config does not exist: ${configPath}`);
  const definition = adapter.configure(
    await loadTestProject<unknown>(configPath),
  );
  const resultDir = options.resultDir
    ? resolve(input.cwd, options.resultDir)
    : join(input.projectRoot, '.midscene', 'test-results');
  const runDir = join(resultDir, runId);
  const summaryPath = join(runDir, 'summary.json');
  const reportDir = resolve(input.projectRoot, definition.output.reportDir);
  mkdirSync(resultDir, { recursive: true });
  mkdirSync(runDir);
  const projects: PreparedExecutionProject[] = [];
  for (const project of selectProjects(
    definition.projects,
    options.projectNames,
  ))
    projects.push(
      await prepareProject(
        project,
        input.projectRoot,
        runDir,
        definition.test.testTimeout,
        adapter.projectOptions,
      ),
    );
  adapter.validate(projects);
  const invocations = projects.flatMap((project) => project.invocations);
  return {
    startedAt,
    runId,
    projectRoot: input.projectRoot,
    ...(configPath ? { configPath } : {}),
    resultDir,
    runDir,
    summaryPath,
    reportDir,
    definition,
    projects,
    preflightScope: adapter.preflightScope,
    reportEnabled:
      invocations.length === 0 ||
      invocations.some((item) => item.reportEnabled),
    publications: adapter.publications(projects),
    onProgress: options.onProgress ?? (() => {}),
  };
}
