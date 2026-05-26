import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
  testFile: string;
  resultFile: string;
  testName: string;
}

export interface GeneratedRstestYamlProject {
  projectDir: string;
  configFile: string;
  generatedDir: string;
  cases: GeneratedYamlTestCase[];
}

export const toPosixPath = (value: string): string =>
  value.split(sep).join('/');

const toImportLiteral = (value: string): string =>
  JSON.stringify(toPosixPath(value));

export const safeFileStem = (file: string, index: number): string => {
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

export const createConfigContent = (options: {
  root: string;
  include: string[];
  maxConcurrency?: number;
  testTimeout: number;
  bail?: number;
}): string => {
  const config = {
    root: options.root,
    include: options.include,
    testEnvironment: 'node',
    testTimeout: options.testTimeout,
    ...(options.maxConcurrency !== undefined
      ? { maxConcurrency: options.maxConcurrency }
      : {}),
    ...(options.bail !== undefined ? { bail: options.bail } : {}),
  };

  return `export default ${JSON.stringify(config, null, 2)};
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
  const generatedDir = join(outputDir, 'generated');
  const resultDir = options.resultDir || join(outputDir, 'results');
  const frameworkImport =
    options.frameworkImport || resolveDefaultFrameworkImport();
  const rstestImport = options.rstestImport || resolveRstestCoreImportPath();

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(generatedDir, { recursive: true });

  const cases = options.files.map((file, index) => {
    const yamlFile = resolve(file);
    const testName = resolveTestName(projectDir, yamlFile);
    const fileStem = safeFileStem(yamlFile, index);
    const resultFile = join(resultDir, `${fileStem}.json`);
    const testFile = join(generatedDir, `${fileStem}.test.ts`);
    writeFileSync(
      testFile,
      createGeneratedTestContent({
        rstestImport,
        frameworkImport,
        yamlFile,
        resultFile,
        testName,
        caseOptions: options.caseOptions?.[yamlFile],
        headed: options.headed,
        keepWindow: options.keepWindow,
      }),
    );
    return { yamlFile, testFile, resultFile, testName };
  });

  const configFile = join(outputDir, 'rstest.config.ts');
  writeFileSync(
    configFile,
    createConfigContent({
      root: projectDir,
      include: cases.map((item) => toPosixPath(item.testFile)),
      maxConcurrency: options.maxConcurrency,
      testTimeout: options.testTimeout ?? 3 * 60 * 1000,
      bail: options.bail,
    }),
  );

  return {
    projectDir: outputDir,
    configFile,
    generatedDir,
    cases,
  };
}
