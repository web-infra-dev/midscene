/**
 * Rstest project generation for the v2 testing framework.
 *
 * Each discovered case YAML becomes a *virtual* Rstest test module that imports
 * `defineMidsceneCaseTest` (the worker entry, see `entry.ts`) and calls it with
 * the case's coordinates. Rstest then schedules those virtual modules — that is
 * the orchestration layer (discovery is ours; scheduling/concurrency/bail/retry
 * are Rstest's). Mirrors `@midscene/cli`'s `framework/rstest-project.ts`.
 */
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

/** Default per-case timeout (0 = no timeout; let the agent run). */
export const DEFAULT_CASE_TEST_TIMEOUT = 0;

export interface CreateRstestProjectOptions {
  /** Absolute path to the `midscene.config.*` file (loaded in each worker). */
  configPath: string;
  /** Absolute case file paths to run. */
  files: string[];
  /** Root used for relative test names and as the Rstest project root. */
  projectDir?: string;
  /** Directory for generated artifacts (virtual module results). */
  outputDir?: string;
  resultDir?: string;
  /** Import specifier/path for the worker entry that registers the test. */
  frameworkImport?: string;
  maxConcurrency?: number;
  testTimeout?: number;
  bail?: number;
  retry?: number;
}

export interface GeneratedCase {
  yamlFile: string;
  testModule: string;
  resultFile: string;
  testName: string;
}

export interface GeneratedRstestProject {
  projectDir: string;
  outputDir: string;
  resultDir: string;
  include: string[];
  virtualModules: Record<string, string>;
  cases: GeneratedCase[];
  maxConcurrency?: number;
  testTimeout: number;
  bail?: number;
  retry?: number;
}

const toPosixPath = (value: string): string => value.split(sep).join('/');

const toImportLiteral = (value: string): string =>
  JSON.stringify(toPosixPath(value));

const toVirtualModuleId = (fileStem: string): string =>
  `virtual:midscene-tf/${fileStem}.test.ts`;

const safeFileStem = (file: string, index: number): string => {
  const base = basename(file, extname(file))
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${String(index + 1).padStart(3, '0')}-${base || 'case'}`;
};

/** Human-readable test name: project-relative POSIX path, or absolute if outside. */
export const resolveTestName = (
  projectDir: string,
  yamlFile: string,
): string => {
  const relativePath = relative(projectDir, yamlFile);
  return toPosixPath(relativePath.startsWith('..') ? yamlFile : relativePath);
};

const createGeneratedTestContent = (options: {
  frameworkImport: string;
  configPath: string;
  yamlFile: string;
  resultFile: string;
  testName: string;
  projectDir: string;
  testTimeout: number;
}): string => {
  const testOptions = {
    testName: options.testName,
    configPath: options.configPath,
    yamlFile: options.yamlFile,
    resultFile: options.resultFile,
    projectRoot: options.projectDir,
    testTimeout: options.testTimeout,
  };

  return `import { defineMidsceneCaseTest } from ${toImportLiteral(options.frameworkImport)};

defineMidsceneCaseTest(${JSON.stringify(testOptions, null, 2)});
`;
};

/**
 * Resolve the default import path for the worker entry. Prefers the built file
 * next to the running CLI; falls back to the published package subpath so
 * Rstest's bundler can resolve it from the project's node_modules.
 */
const resolveDefaultFrameworkImport = (): string => {
  const entry = process.argv[1] ? resolve(process.argv[1]) : '';
  const candidates = [
    entry ? join(dirname(entry), 'rstest-entry.js') : '',
    entry ? join(dirname(entry), '..', 'dist', 'lib', 'rstest-entry.js') : '',
  ].filter(Boolean);

  const matched = candidates.find((candidate) => existsSync(candidate));
  return matched || '@midscene/testing-framework/dist/lib/rstest-entry.js';
};

export function createRstestProject(
  options: CreateRstestProjectOptions,
): GeneratedRstestProject {
  const projectDir = resolve(options.projectDir || process.cwd());
  const outputDir =
    options.outputDir ||
    join(projectDir, 'midscene_run', 'tmp', `rstest-tf-${Date.now()}`);
  const resultDir = options.resultDir || join(outputDir, 'results');
  const frameworkImport =
    options.frameworkImport || resolveDefaultFrameworkImport();
  const testTimeout = options.testTimeout ?? DEFAULT_CASE_TEST_TIMEOUT;
  const configPath = resolve(options.configPath);

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
      configPath,
      yamlFile,
      resultFile,
      testName,
      projectDir,
      testTimeout,
    });
    return { yamlFile, testModule, resultFile, testName };
  });

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
    retry: options.retry,
  };
}
