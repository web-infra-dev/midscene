import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import type { RstestUserConfig, TestRunResult } from '@rstest/core/api';
import type { WorkflowRunManifest } from '../manifest';
import type { WorkflowDocumentSource } from '../parser/types';

const CONFIG_NAMES = [
  'midscene.workflow.config.cjs',
  'midscene.workflow.config.js',
];
const SKIPPED_DIRECTORIES = new Set(['.git', '.midscene', 'node_modules']);

const toPosix = (value: string): string => value.split(sep).join('/');

export interface WorkflowProjectRunOptions {
  projectRoot: string;
  configPath?: string;
  resultDir?: string;
  mode?: 'serial' | 'parallel';
  maxConcurrency?: number;
  retry?: number;
  bail?: number;
  bridgePath?: string;
  runRstest?: (options: {
    cwd: string;
    files: string[];
    inlineConfig: RstestUserConfig;
  }) => Promise<TestRunResult>;
}

export interface WorkflowProjectRunResult {
  exitCode: number;
  manifestPath: string;
  manifest: WorkflowRunManifest;
  rstest: TestRunResult;
}

export const discoverWorkflowFiles = (projectRoot: string): string[] => {
  const root = resolve(projectRoot);
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          visit(join(directory, entry.name));
        }
        continue;
      }
      if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  };
  visit(root);
  return files.sort((a, b) =>
    toPosix(relative(root, a)).localeCompare(toPosix(relative(root, b))),
  );
};

export const discoverWorkflowConfig = (
  projectRoot: string,
): string | undefined =>
  CONFIG_NAMES.map((name) => join(resolve(projectRoot), name)).find(existsSync);

export const resolveWorkflowBridgePath = (moduleDir?: string): string => {
  const directory = moduleDir ?? __dirname;
  const candidates = [
    join(directory, 'workflow-rstest-bridge.test.js'),
    join(directory, 'cli', 'workflow-rstest-bridge.test.js'),
    join(directory, 'workflow-rstest-bridge.test.ts'),
    join(directory, 'cli', 'workflow-rstest-bridge.test.ts'),
  ];
  const found = candidates.find(existsSync);
  if (!found) {
    throw new Error(
      'Could not locate the fixed workflow Rstest bridge module.',
    );
  }
  return found;
};

const defaultResultDir = (projectRoot: string): string =>
  join(
    projectRoot,
    '.midscene',
    'workflow-results',
    `${Date.now()}-${process.pid}`,
  );

const defaultRunRstest: NonNullable<
  WorkflowProjectRunOptions['runRstest']
> = async (options) => {
  const { runRstest } = await import('@rstest/core/api');
  return runRstest(options);
};

export async function runWorkflowProject(
  options: WorkflowProjectRunOptions,
): Promise<WorkflowProjectRunResult> {
  const projectRoot = resolve(options.projectRoot);
  if (!existsSync(projectRoot)) {
    throw new Error(
      `Workflow project directory does not exist: ${projectRoot}`,
    );
  }
  const files = discoverWorkflowFiles(projectRoot);
  if (files.length === 0) {
    throw new Error(`No workflow YAML files found in ${projectRoot}.`);
  }
  const resultDir = resolve(options.resultDir ?? defaultResultDir(projectRoot));
  const configPath = options.configPath
    ? resolve(projectRoot, options.configPath)
    : discoverWorkflowConfig(projectRoot);
  if (options.configPath && (!configPath || !existsSync(configPath))) {
    throw new Error(`Workflow config does not exist: ${configPath}`);
  }
  mkdirSync(resultDir, { recursive: true });

  const projectId = basename(projectRoot);
  const sources: WorkflowDocumentSource[] = files.map((absolutePath) => ({
    projectId,
    sourcePath: toPosix(relative(projectRoot, absolutePath)),
    absolutePath,
  }));
  const manifest: WorkflowRunManifest = {
    version: 1,
    projectId,
    projectRoot,
    ...(configPath ? { configPath } : {}),
    sources,
    mode: options.mode ?? 'serial',
    ...(options.maxConcurrency === undefined
      ? {}
      : { maxConcurrency: options.maxConcurrency }),
    ...(options.retry === undefined ? {} : { retry: options.retry }),
    ...(options.bail === undefined ? {} : { bail: options.bail }),
    resultDir,
  };
  const manifestPath = join(resultDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const bridgePath = options.bridgePath ?? resolveWorkflowBridgePath();
  const inlineConfig: RstestUserConfig = {
    root: projectRoot,
    include: [bridgePath],
    exclude: [],
    testEnvironment: 'node',
    reporters: [],
    testTimeout: 0,
    env: { MIDSCENE_WORKFLOW_MANIFEST: manifestPath },
    pool: { maxWorkers: 1, minWorkers: 1 },
    ...(options.maxConcurrency === undefined
      ? {}
      : { maxConcurrency: options.maxConcurrency }),
    ...(options.retry === undefined ? {} : { retry: options.retry }),
    ...(options.bail === undefined ? {} : { bail: options.bail }),
  };
  const rstest = await (options.runRstest ?? defaultRunRstest)({
    cwd: projectRoot,
    files: [bridgePath],
    inlineConfig,
  });

  return {
    exitCode: rstest.ok ? 0 : 1,
    manifestPath,
    manifest,
    rstest,
  };
}
