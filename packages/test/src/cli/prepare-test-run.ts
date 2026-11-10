import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  resolveMidsceneRunDir,
  runWithMidsceneRunDir,
} from '@midscene/shared/common';
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

export const resolveRunInput = (
  options: Pick<
    TestProjectRunOptions,
    'cwd' | 'projectRoot' | 'configPath' | 'testPath'
  >,
): TestRunInput => {
  const cwd = resolve(options.cwd ?? process.cwd());
  assertDirectory(cwd, 'Test working directory');
  const searchRoot = resolve(cwd, options.projectRoot ?? '.');
  assertDirectory(searchRoot, 'Test project directory');
  const configPath = options.configPath
    ? resolve(cwd, options.configPath)
    : discoverTestConfig(searchRoot);
  if (options.configPath && /\.ya?ml$/i.test(configPath!)) {
    throw new Error(
      `midscene-test --config only accepts a native TypeScript or JavaScript project config: ${configPath}. Run legacy batch YAML with \`midscene --config ${options.configPath}\`.`,
    );
  }
  if (configPath && (!existsSync(configPath) || !statSync(configPath).isFile()))
    throw new Error(
      `Midscene config does not exist or is not a file: ${configPath}`,
    );
  const testPath = options.testPath
    ? resolve(cwd, options.testPath)
    : undefined;
  if (testPath) {
    if (!existsSync(testPath))
      throw new Error(`Test path does not exist: ${testPath}`);
    const stat = statSync(testPath);
    if (!stat.isDirectory() && !(stat.isFile() && /\.ya?ml$/i.test(testPath)))
      throw new Error(
        `Test input must be a YAML file or directory: ${testPath}`,
      );
  }
  return {
    cwd,
    projectRoot: configPath ? dirname(configPath) : searchRoot,
    ...(configPath ? { configPath } : {}),
    ...(testPath ? { testPath } : {}),
  };
};

/** Composition boundary only: execution receives no raw input syntax or host options. */
export async function prepareTestRun(
  options: TestProjectRunOptions,
): Promise<PreparedTestRunPlan> {
  const startedAt = new Date();
  const runId = createTestRunId(startedAt);
  const input = resolveRunInput(options);
  const { configPath } = input;
  const standalonePath = configPath ? undefined : input.testPath;
  const discovery =
    standalonePath && statSync(standalonePath).isFile()
      ? { files: [standalonePath] }
      : { discoveryRoot: standalonePath };
  const definition = await loadTestProject<unknown>(configPath);
  const artifactDir = resolveMidsceneRunDir(input.projectRoot);
  return runWithMidsceneRunDir(artifactDir, async () => {
    const resultDir = options.resultDir
      ? resolve(input.cwd, options.resultDir)
      : join(artifactDir, 'test-results');
    const runDir = join(resultDir, runId);
    const summaryPath = join(runDir, 'summary.json');
    const reportDir = definition.output.reportDir
      ? resolve(input.projectRoot, definition.output.reportDir)
      : join(artifactDir, 'report');
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
          {
            testPath: input.testPath,
            ...discovery,
            excludedDirectories: [
              artifactDir,
              resultDir,
              reportDir,
              ...['cache', 'log', 'output', 'tmp', 'dump'].map((name) =>
                join(artifactDir, name),
              ),
            ],
          },
        ),
      );
    if (
      input.testPath &&
      projects.every(
        (project) =>
          project.selectedCaseCount === 0 &&
          project.collectionErrors.length === 0,
      )
    )
      throw new Error(
        `No test cases match "${input.testPath}" in ${input.projectRoot}. Check --project, files.include/files.exclude, tags, and ignored output directories.`,
      );
    const hasFormatMismatch = projects.some((project) =>
      project.collectionErrors.some(
        ({ error }) => error instanceof NativeWorkflowFormatError,
      ),
    );
    return {
      startedAt,
      runId,
      projectRoot: input.projectRoot,
      artifactDir,
      ...(configPath ? { configPath } : {}),
      resultDir,
      runDir,
      summaryPath,
      reportDir,
      definition,
      projects,
      // A wrong-format file invalidates the complete command invocation. Other
      // native collection failures retain the existing per-Project isolation.
      preflightScope: hasFormatMismatch ? 'run' : 'project',
      reportEnabled: true,
      publications: [],
      onProgress: options.onProgress ?? (() => {}),
      onEvent: options.onEvent,
    };
  });
}
