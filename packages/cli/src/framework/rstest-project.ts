import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
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
import { compileFeatureFile, isFeatureFile } from './feature-file';
import { resolveRstestCoreImportPath } from './rstest-dependencies';
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
export const RSTEST_YAML_BATCH_TEST_MODULE =
  'virtual:midscene-yaml/batch.test.ts';
export const RSTEST_YAML_BATCH_TEST_NAME = 'midscene yaml batch';

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

export interface GeneratedYamlTestCase {
  yamlFile: string;
  testModule: string;
  resultFile: string;
  testName: string;
}

export interface GeneratedFeatureLoaderCase {
  testName: string;
  resultFile: string;
  caseOptions?: RstestYamlCaseOptions;
  webRuntimeOptions?: WebYamlRuntimeOptions;
}

export interface GeneratedFeatureLoaderOptions {
  frameworkImport: string;
  rstestCoreImport: string;
  featureCasesByFile: Record<string, GeneratedFeatureLoaderCase[]>;
}

export interface GeneratedYamlBatchTest {
  testModule: string;
  testName: string;
}

export interface GeneratedRstestYamlProject {
  projectDir: string;
  outputDir: string;
  resultDir: string;
  include: string[];
  virtualModules: Record<string, string>;
  cases: GeneratedYamlTestCase[];
  batchTest?: GeneratedYamlBatchTest;
  maxConcurrency?: number;
  testTimeout: number;
  bail?: number;
  retry?: number;
  featureLoaderOptions?: GeneratedFeatureLoaderOptions;
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

const createGeneratedTestContent = (options: {
  rstestCoreImport: string;
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

  return `import { test } from ${toImportLiteral(options.rstestCoreImport)};
import { defineYamlCaseTest } from ${toImportLiteral(options.frameworkImport)};

const testOptions = ${JSON.stringify(testOptions, null, 2)};

defineYamlCaseTest(test, testOptions);
`;
};

const createGeneratedBatchTestContent = (options: {
  rstestCoreImport: string;
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

  return `import { test } from ${toImportLiteral(options.rstestCoreImport)};
import { defineYamlBatchTest } from ${toImportLiteral(options.frameworkImport)};

const testOptions = ${JSON.stringify(testOptions, null, 2)};

defineYamlBatchTest(test, testOptions);
`;
};

const createGeneratedFailureTestContent = (options: {
  rstestCoreImport: string;
  testName: string;
  error: string;
}): string => `import { test } from ${toImportLiteral(options.rstestCoreImport)};

test(${JSON.stringify(options.testName)}, () => {
  throw new Error(${JSON.stringify(options.error)});
});
`;

const createGeneratedProjectEntries = (options: {
  files: string[];
  projectDir: string;
  resultDir: string;
  frameworkImport: string;
  rstestCoreImport: string;
  caseOptions?: Record<string, RstestYamlCaseOptions>;
  webRuntimeOptions?: Record<string, WebYamlRuntimeOptions>;
}) => {
  let caseIndex = 0;
  const include: string[] = [];
  const virtualModules: Record<string, string> = {};
  const cases: GeneratedYamlTestCase[] = [];
  const featureCasesByFile: Record<string, GeneratedFeatureLoaderCase[]> = {};

  for (const file of options.files) {
    const yamlFile = resolve(file);
    const relativeTestName = resolveTestName(options.projectDir, yamlFile);

    if (!isFeatureFile(yamlFile)) {
      const fileStem = safeFileStem(yamlFile, caseIndex);
      caseIndex += 1;
      const testModule = toVirtualModuleId(fileStem);
      const resultFile = join(options.resultDir, `${fileStem}.json`);
      virtualModules[testModule] = createGeneratedTestContent({
        rstestCoreImport: options.rstestCoreImport,
        frameworkImport: options.frameworkImport,
        yamlFile,
        resultFile,
        testName: relativeTestName,
        caseOptions: options.caseOptions?.[yamlFile],
        webRuntimeOptions: options.webRuntimeOptions?.[yamlFile],
      });
      include.push(testModule);
      cases.push({
        yamlFile,
        testModule,
        resultFile,
        testName: relativeTestName,
      });
      continue;
    }

    let scenarios: ReturnType<typeof compileFeatureFile>;
    try {
      scenarios = compileFeatureFile(readFileSync(yamlFile, 'utf8'), yamlFile);
    } catch (error) {
      const fileStem = safeFileStem(yamlFile, caseIndex);
      caseIndex += 1;
      const testModule = toVirtualModuleId(fileStem);
      const resultFile = join(options.resultDir, `${fileStem}.json`);
      const message = error instanceof Error ? error.message : String(error);
      virtualModules[testModule] = createGeneratedFailureTestContent({
        rstestCoreImport: options.rstestCoreImport,
        testName: relativeTestName,
        error: message,
      });
      include.push(testModule);
      cases.push({
        yamlFile,
        testModule,
        resultFile,
        testName: relativeTestName,
      });
      continue;
    }

    include.push(yamlFile);

    featureCasesByFile[yamlFile] = scenarios.map((scenario) => {
      const scenarioFileName = `${basename(
        yamlFile,
        extname(yamlFile),
      )}-${scenario.scenarioName.toLowerCase()}`;
      const fileStem = safeFileStem(
        join(dirname(yamlFile), scenarioFileName),
        caseIndex,
      );
      caseIndex += 1;
      const resultFile = join(options.resultDir, `${fileStem}.json`);
      const testName = `${relativeTestName} > ${scenario.testName}`;
      cases.push({
        yamlFile,
        testModule: yamlFile,
        resultFile,
        testName,
      });
      return {
        testName,
        resultFile,
        caseOptions: {
          ...options.caseOptions?.[yamlFile],
          executionConfig: scenario.executionConfig,
        },
        webRuntimeOptions: options.webRuntimeOptions?.[yamlFile],
      };
    });
  }

  const featureLoaderOptions = Object.keys(featureCasesByFile).length
    ? {
        frameworkImport: options.frameworkImport,
        rstestCoreImport: options.rstestCoreImport,
        featureCasesByFile,
      }
    : undefined;

  return { include, virtualModules, cases, featureLoaderOptions };
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
  if (options.batchConfig && options.files.some(isFeatureFile)) {
    throw new Error('shareBrowserContext is not supported for .feature files');
  }

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

  const generated = createGeneratedProjectEntries({
    files: options.files,
    projectDir,
    resultDir,
    frameworkImport,
    rstestCoreImport,
    caseOptions: options.caseOptions,
    webRuntimeOptions: options.webRuntimeOptions,
  });

  if (options.batchConfig) {
    const resultFiles = Object.fromEntries(
      generated.cases.map((item) => [item.yamlFile, item.resultFile]),
    );
    const batchTest = {
      testModule: RSTEST_YAML_BATCH_TEST_MODULE,
      testName: RSTEST_YAML_BATCH_TEST_NAME,
    };
    return {
      projectDir,
      outputDir,
      resultDir,
      include: [batchTest.testModule],
      virtualModules: {
        [batchTest.testModule]: createGeneratedBatchTestContent({
          rstestCoreImport,
          frameworkImport,
          testName: batchTest.testName,
          config: options.batchConfig,
          resultFiles,
        }),
      },
      cases: generated.cases,
      batchTest,
      maxConcurrency: 1,
      testTimeout,
      bail: options.bail,
    };
  }

  return {
    projectDir,
    outputDir,
    resultDir,
    include: generated.include,
    virtualModules: generated.virtualModules,
    cases: generated.cases,
    featureLoaderOptions: generated.featureLoaderOptions,
    maxConcurrency: options.maxConcurrency,
    testTimeout,
    bail: options.bail,
    retry: options.retry,
  };
}
