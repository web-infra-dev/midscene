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
import { resolveRstestCoreImportPath } from './rstest-runner';
import type { RunYamlCaseInChildProcessOptions } from './yaml-child-process';

type GeneratedCaseOptions = Omit<
  RunYamlCaseInChildProcessOptions,
  'file' | 'frameworkImport'
>;

export interface CreateRstestYamlProjectOptions {
  files: string[];
  projectDir?: string;
  outputDir?: string;
  resultDir?: string;
  frameworkImport?: string;
  rstestImport?: string;
  caseOptions?: Record<string, GeneratedCaseOptions>;
  headed?: boolean;
  keepWindow?: boolean;
  maxConcurrency?: number;
  testTimeout?: number;
  bail?: number;
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
  rstestImport: string;
  frameworkImport: string;
  yamlFile: string;
  resultFile?: string;
  testName: string;
  headed?: boolean;
  keepWindow?: boolean;
  caseOptions?: GeneratedCaseOptions;
}): string => {
  const runOptions = {
    file: options.yamlFile,
    ...options.caseOptions,
    ...(options.headed !== undefined ? { headed: options.headed } : {}),
    ...(options.keepWindow !== undefined
      ? { keepWindow: options.keepWindow }
      : {}),
  };

  return `import { test } from ${toImportLiteral(options.rstestImport)};

test(${JSON.stringify(options.testName)}, async () => {
  const framework = await import(${toImportLiteral(options.frameworkImport)});
  const runYamlCaseInChildProcess =
    framework.runYamlCaseInChildProcess ||
    framework.default?.runYamlCaseInChildProcess;
  const runYamlCase = framework.runYamlCase || framework.default?.runYamlCase;
  if (typeof runYamlCaseInChildProcess === 'function') {
    await runYamlCaseInChildProcess({
      ...${JSON.stringify(runOptions, null, 2)},
      frameworkImport: ${toImportLiteral(options.frameworkImport)}${
        options.resultFile
          ? `,
      resultFile: ${toImportLiteral(options.resultFile)}`
          : ''
      }
    });
    return;
  }
  if (typeof runYamlCase !== 'function') {
    throw new Error('Cannot find runYamlCase from Midscene framework entry');
  }
  await runYamlCase(${JSON.stringify(runOptions, null, 2)});
});
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
  const rstestImport = options.rstestImport || resolveRstestCoreImportPath();
  const testTimeout = options.testTimeout ?? 3 * 60 * 1000;

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(resultDir, { recursive: true });

  const virtualModules: Record<string, string> = {};
  const cases = options.files.map((file, index) => {
    const yamlFile = resolve(file);
    const testName = resolveTestName(projectDir, yamlFile);
    const fileStem = safeFileStem(yamlFile, index);
    const resultFile = join(resultDir, `${fileStem}.json`);
    const testModule = `virtual/midscene-yaml/${fileStem}.test.ts`;
    virtualModules[testModule] = createGeneratedTestContent({
      rstestImport,
      frameworkImport,
      yamlFile,
      resultFile,
      testName,
      caseOptions: options.caseOptions?.[yamlFile],
      headed: options.headed,
      keepWindow: options.keepWindow,
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
  };
}
