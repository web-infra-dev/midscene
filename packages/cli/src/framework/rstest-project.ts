import { existsSync, mkdirSync, rmSync } from 'node:fs';
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import type { BatchRunnerConfig } from '../batch-runner';
import type { RunYamlCaseOptions } from './yaml-case';

export type RstestYamlCaseOptions = Omit<
  RunYamlCaseOptions,
  'file' | 'headed' | 'keepWindow'
>;

export type WebYamlRuntimeOptions = Pick<
  RunYamlCaseOptions,
  'headed' | 'keepWindow'
>;

export const DEFAULT_YAML_TEST_TIMEOUT = 0;

export interface CreateRstestYamlProjectOptions {
  files: string[];
  projectDir?: string;
  outputDir?: string;
  resultDir?: string;
  frameworkImport?: string;
  caseOptions?: Record<string, RstestYamlCaseOptions>;
  webRuntimeOptions?: Record<string, WebYamlRuntimeOptions>;
  maxConcurrency?: number;
  testTimeout?: number;
  bail?: number;
  batchConfig?: BatchRunnerConfig;
}

export interface GeneratedYamlTestCase {
  yamlFile: string;
  testModule: string;
  resultFile: string;
  testName: string;
}

export interface GeneratedRstestYamlProject {
  projectDir: string;
  outputDir: string;
  resultDir: string;
  include: string[];
  virtualModules: Record<string, string>;
  cases: GeneratedYamlTestCase[];
  maxConcurrency?: number;
  testTimeout: number;
  bail?: number;
}

const toPosixPath = (value: string): string => value.split(sep).join('/');

const toImportLiteral = (value: string): string =>
  JSON.stringify(toPosixPath(value));

const toVirtualModuleId = (fileStem: string): string =>
  `virtual:midscene-yaml/${fileStem}.test.ts`;

const trimEdgeHyphens = (value: string): string => {
  let start = 0;
  let end = value.length;

  while (start < end && value.charCodeAt(start) === 45) {
    start += 1;
  }
  while (end > start && value.charCodeAt(end - 1) === 45) {
    end -= 1;
  }

  return value.slice(start, end);
};

const safeFileStem = (file: string, index: number): string => {
  const base = trimEdgeHyphens(
    basename(file, extname(file)).replace(/[^a-zA-Z0-9._-]+/g, '-'),
  );
  return `${String(index + 1).padStart(3, '0')}-${base || 'case'}`;
};

export const resolveTestName = (
  projectDir: string,
  yamlFile: string,
): string => {
  const relativePath = relative(projectDir, yamlFile);
  return toPosixPath(relativePath.startsWith('..') ? yamlFile : relativePath);
};

const createGeneratedTestContent = (options: {
  frameworkImport: string;
  yamlFile: string;
  resultFile: string;
  testName: string;
  caseOptions?: RstestYamlCaseOptions;
  webRuntimeOptions?: WebYamlRuntimeOptions;
}): string => {
  const testOptions = {
    testName: options.testName,
    yamlFile: options.yamlFile,
    resultFile: options.resultFile,
    ...(options.caseOptions ? { caseOptions: options.caseOptions } : {}),
    ...(options.webRuntimeOptions
      ? { webRuntimeOptions: options.webRuntimeOptions }
      : {}),
  };

  return `import { defineYamlCaseTest } from ${toImportLiteral(options.frameworkImport)};

defineYamlCaseTest(${JSON.stringify(testOptions, null, 2)});
`;
};

const createGeneratedBatchTestContent = (options: {
  frameworkImport: string;
  testName: string;
  config: BatchRunnerConfig;
  resultFiles: Record<string, string>;
}): string => {
  const testOptions = {
    testName: options.testName,
    config: options.config,
    resultFiles: options.resultFiles,
  };

  return `import { defineYamlBatchTest } from ${toImportLiteral(options.frameworkImport)};

defineYamlBatchTest(${JSON.stringify(testOptions, null, 2)});
`;
};

const resolveDefaultFrameworkImport = (): string => {
  const entry = process.argv[1] ? resolve(process.argv[1]) : '';
  const candidates = [
    entry ? join(dirname(entry), 'framework', 'index.js') : '',
    entry
      ? join(dirname(entry), '..', 'dist', 'lib', 'framework', 'index.js')
      : '',
  ].filter(Boolean);

  const matched = candidates.find((candidate) => existsSync(candidate));
  return matched || '@midscene/cli/dist/lib/framework/index.js';
};

export function createRstestYamlProject(
  options: CreateRstestYamlProjectOptions,
): GeneratedRstestYamlProject {
  const projectDir = resolve(options.projectDir || process.cwd());
  const outputDir =
    options.outputDir ||
    join(getMidsceneRunSubDir('tmp'), `rstest-yaml-${Date.now()}`);
  const resultDir = options.resultDir || join(outputDir, 'results');
  const frameworkImport =
    options.frameworkImport || resolveDefaultFrameworkImport();
  const testTimeout = options.testTimeout ?? DEFAULT_YAML_TEST_TIMEOUT;

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(resultDir, { recursive: true });

  const virtualModules: Record<string, string> = {};
  const cases = options.files.map((file, index) => {
    const yamlFile = resolve(file);
    const testName = resolveTestName(projectDir, yamlFile);
    const fileStem = safeFileStem(yamlFile, index);
    const resultFile = join(resultDir, `${fileStem}.json`);
    const testModule = toVirtualModuleId(fileStem);
    virtualModules[testModule] = createGeneratedTestContent({
      frameworkImport,
      yamlFile,
      resultFile,
      testName,
      caseOptions: options.caseOptions?.[yamlFile],
      webRuntimeOptions: options.webRuntimeOptions?.[yamlFile],
    });
    return { yamlFile, testModule, resultFile, testName };
  });

  if (options.batchConfig) {
    const batchModule = 'virtual:midscene-yaml/batch.test.ts';
    const resultFiles = Object.fromEntries(
      cases.map((item) => [item.yamlFile, item.resultFile]),
    );
    return {
      projectDir,
      outputDir,
      resultDir,
      include: [batchModule],
      virtualModules: {
        [batchModule]: createGeneratedBatchTestContent({
          frameworkImport,
          testName: 'midscene yaml batch',
          config: options.batchConfig,
          resultFiles,
        }),
      },
      cases,
      maxConcurrency: 1,
      testTimeout,
      bail: options.bail,
    };
  }

  return {
    projectDir,
    outputDir,
    resultDir,
    include: cases.map((item) => item.testModule),
    virtualModules,
    cases,
    maxConcurrency: options.maxConcurrency,
    testTimeout,
    bail: options.bail,
  };
}
