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
import type {
  DefineYamlBatchTestOptions,
  DefineYamlCaseTestOptions,
  RstestYamlCaseOptions,
  WebYamlRuntimeOptions,
} from './rstest-contract';
import { resolveRstestCoreImportPath } from './rstest-dependencies';

export type {
  RstestYamlCaseOptions,
  WebYamlRuntimeOptions,
} from './rstest-contract';

export const DEFAULT_YAML_TEST_TIMEOUT = 0;
export const RSTEST_YAML_BATCH_TEST_MODULE =
  'virtual:midscene-yaml/batch.test.ts';
export const RSTEST_YAML_BATCH_TEST_NAME = 'midscene yaml batch';
export const RSTEST_YAML_SEQUENTIAL_TEST_MODULE =
  'virtual:midscene-yaml/sequential.test.ts';

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
  retry?: number;
  batchConfig?: BatchRunnerConfig;
  rstestCoreImport?: string;
}

export type GeneratedYamlTestCase = DefineYamlCaseTestOptions;

export interface GeneratedRstestYamlModule {
  id: string;
  source: string;
  caseIds: string[];
}

export interface GeneratedRstestYamlProject {
  projectDir: string;
  outputDir: string;
  resultDir: string;
  modules: GeneratedRstestYamlModule[];
  cases: GeneratedYamlTestCase[];
  maxConcurrency?: number;
  testTimeout: number;
  bail?: number;
  retry?: number;
}

const toPosixPath = (value: string): string => value.split(sep).join('/');

const toImportLiteral = (value: string): string =>
  JSON.stringify(toPosixPath(value));

const toVirtualModuleId = (fileStem: string): string =>
  `virtual:midscene-yaml/${fileStem}.test.ts`;

const safeFileStem = (file: string, index: number): string => {
  const base = basename(file, extname(file))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${String(index + 1).padStart(3, '0')}-${base || 'case'}`;
};

export const resolveTestName = (
  projectDir: string,
  yamlFile: string,
): string => {
  const relativePath = relative(projectDir, yamlFile);
  return toPosixPath(relativePath.startsWith('..') ? yamlFile : relativePath);
};

const createGeneratedCaseTestContent = (options: {
  rstestCoreImport: string;
  frameworkImport: string;
  testOptions: DefineYamlCaseTestOptions[];
  sequential: boolean;
}): string => `import { test } from ${toImportLiteral(options.rstestCoreImport)};
import { defineYamlCaseTest } from ${toImportLiteral(options.frameworkImport)};

const testOptionsList = ${JSON.stringify(options.testOptions, null, 2)};

for (const testOptions of testOptionsList) {
  defineYamlCaseTest(${options.sequential ? 'test.sequential' : 'test'}, testOptions);
}
`;

const createGeneratedBatchTestContent = (options: {
  rstestCoreImport: string;
  frameworkImport: string;
  testOptions: DefineYamlBatchTestOptions;
}): string => {
  return `import { test } from ${toImportLiteral(options.rstestCoreImport)};
import { defineYamlBatchTest } from ${toImportLiteral(options.frameworkImport)};

const testOptions = ${JSON.stringify(options.testOptions, null, 2)};

defineYamlBatchTest(test, testOptions);
`;
};

// Anchor the framework entry on this bundle's own directory rather than
// `process.argv[1]`. The command-line entry can be a `.bin` symlink, an
// `npx` cache path, or a wrapper script whose directory does not lead to the
// compiled `framework/index.js`. In those cases the argv-based lookup below
// falls through to the bare specifier `@midscene/cli/dist/lib/framework/
// index.js`, which the generated virtual test module then fails to resolve
// from the user's CWD ("Cannot find module ..."), silently turning every run
// into "not executed". `__dirname` always points at the installed CLI output
// (this mirrors `requireFromCliPackage` in rstest-runner.ts). Resolve to an
// absolute path so the virtual module imports it regardless of CWD.
// `moduleDir` is injectable so tests can exercise the resolution order without
// depending on the dist layout.
export const resolveDefaultFrameworkImport = (moduleDir?: string): string => {
  const anchorDir =
    moduleDir ?? (typeof __dirname !== 'undefined' ? __dirname : undefined);
  const candidates = [
    anchorDir ? join(anchorDir, 'framework', 'index.js') : '',
  ];

  const entry = process.argv[1] ? resolve(process.argv[1]) : '';
  if (entry) {
    candidates.push(join(dirname(entry), 'framework', 'index.js'));
    candidates.push(
      join(dirname(entry), '..', 'dist', 'lib', 'framework', 'index.js'),
    );
  }

  const matched = candidates
    .filter(Boolean)
    .find((candidate) => existsSync(candidate));
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
  const rstestCoreImport =
    options.rstestCoreImport || resolveRstestCoreImportPath();
  const testTimeout = options.testTimeout ?? DEFAULT_YAML_TEST_TIMEOUT;

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(resultDir, { recursive: true });

  // The batch executor reports setup as a first-class result. Reserve a result
  // file for it too, otherwise the parent process drops it from the terminal
  // and JSON summaries even though it ran inside the Rstest worker.
  const resultYamlFiles = options.batchConfig
    ? [
        ...(options.batchConfig.setup ? [options.batchConfig.setup] : []),
        ...options.batchConfig.files,
      ]
    : options.files;
  const cases: GeneratedYamlTestCase[] = resultYamlFiles.map((file, index) => {
    const yamlFile = resolve(file);
    const testName = resolveTestName(projectDir, yamlFile);
    const caseId = safeFileStem(yamlFile, index);
    const resultFile = join(resultDir, `${caseId}.json`);
    return {
      caseId,
      yamlFile,
      resultFile,
      testName,
      retry: options.retry,
      ...(options.caseOptions?.[yamlFile]
        ? { caseOptions: options.caseOptions[yamlFile] }
        : {}),
      ...(options.webRuntimeOptions?.[yamlFile]
        ? { webRuntimeOptions: options.webRuntimeOptions[yamlFile] }
        : {}),
    };
  });

  const baseProject = {
    projectDir,
    outputDir,
    resultDir,
    cases,
    testTimeout,
    bail: options.bail,
  };

  if (options.batchConfig) {
    const testOptions: DefineYamlBatchTestOptions = {
      caseIds: cases.map((item) => item.caseId),
      testName: RSTEST_YAML_BATCH_TEST_NAME,
      config: options.batchConfig,
      resultTargets: cases.map(({ yamlFile, resultFile }) => ({
        yamlFile,
        resultFile,
      })),
    };
    return {
      ...baseProject,
      modules: [
        {
          id: RSTEST_YAML_BATCH_TEST_MODULE,
          caseIds: testOptions.caseIds,
          source: createGeneratedBatchTestContent({
            rstestCoreImport,
            frameworkImport,
            testOptions,
          }),
        },
      ],
      maxConcurrency: 1,
    };
  }

  // Rstest limits concurrency but does not guarantee that separate test files
  // start in `include` order. Put serial YAML cases in one virtual module so
  // Rstest executes their tests in declaration order. This keeps retries and
  // per-case reporting in Rstest while making `concurrent: 1` actually honor
  // the order of the config file's `files` array.
  if (options.maxConcurrency === 1) {
    const caseIds = cases.map((item) => item.caseId);
    return {
      ...baseProject,
      modules: [
        {
          id: RSTEST_YAML_SEQUENTIAL_TEST_MODULE,
          caseIds,
          source: createGeneratedCaseTestContent({
            rstestCoreImport,
            frameworkImport,
            testOptions: cases,
            sequential: true,
          }),
        },
      ],
      maxConcurrency: 1,
      retry: options.retry,
    };
  }

  return {
    ...baseProject,
    modules: cases.map((item) => {
      const id = toVirtualModuleId(item.caseId);
      return {
        id,
        caseIds: [item.caseId],
        source: createGeneratedCaseTestContent({
          rstestCoreImport,
          frameworkImport,
          testOptions: [item],
          sequential: false,
        }),
      };
    }),
    maxConcurrency: options.maxConcurrency,
    retry: options.retry,
  };
}
