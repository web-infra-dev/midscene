import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getMidsceneRunDir } from '@midscene/shared/common';
import type {
  FrameworkTestFile,
  LoadedMidsceneConfig,
} from '@midscene/testing-framework';
import { createYamlFrameworkTestSource } from '@midscene/testing-framework/runtime';
import {
  createConfigContent,
  resolveTestName,
  safeFileStem,
  toPosixPath,
} from './rstest-project';
import { resolveRstestCoreImportPath } from './rstest-runner';

export interface CreateRstestFrameworkProjectOptions {
  loadedConfig: LoadedMidsceneConfig;
  files: FrameworkTestFile[];
  outputDir?: string;
  runtimeImport?: string;
  rstestImport?: string;
  maxConcurrency?: number;
  testTimeout?: number;
  bail?: number;
}

export interface GeneratedFrameworkYamlTestCase {
  yamlFile: string;
  testFile: string;
  testName: string;
}

export interface GeneratedRstestFrameworkProject {
  projectDir: string;
  configFile: string;
  generatedDir: string;
  yamlCases: GeneratedFrameworkYamlTestCase[];
  testFiles: string[];
}

const DEFAULT_TEST_TIMEOUT = 3 * 60 * 1000;

const createDefaultOutputDir = (projectRoot: string): string =>
  join(
    resolve(projectRoot, getMidsceneRunDir()),
    'tmp',
    `rstest-framework-${Date.now()}`,
  );

export function createRstestFrameworkProject(
  options: CreateRstestFrameworkProjectOptions,
): GeneratedRstestFrameworkProject {
  const projectRoot = options.loadedConfig.root;
  const outputDir = options.outputDir || createDefaultOutputDir(projectRoot);
  const generatedDir = join(outputDir, 'generated');
  const runtimeImport =
    options.runtimeImport || '@midscene/testing-framework/runtime';
  const rstestImport = options.rstestImport || resolveRstestCoreImportPath();

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(generatedDir, { recursive: true });

  const yamlFiles = options.files.filter((file) => file.type === 'yaml');
  const yamlCases = yamlFiles.map((file, index) => {
    const yamlFile = resolve(file.filePath);
    const testName = resolveTestName(projectRoot, yamlFile);
    const fileStem = safeFileStem(yamlFile, index);
    const testFile = join(generatedDir, `${fileStem}.test.ts`);
    writeFileSync(
      testFile,
      createYamlFrameworkTestSource({
        configPath: options.loadedConfig.path,
        filePath: yamlFile,
        testName,
        runtimeImport,
        rstestImport,
      }),
    );
    return { yamlFile, testFile, testName };
  });

  const testFiles = [
    ...yamlCases.map((item) => item.testFile),
    ...options.files
      .filter((file) => file.type === 'test')
      .map((file) => resolve(file.filePath)),
  ];

  const configFile = join(outputDir, 'rstest.config.ts');
  writeFileSync(
    configFile,
    createConfigContent({
      root: projectRoot,
      include: testFiles.map((file) => toPosixPath(file)),
      maxConcurrency: options.maxConcurrency,
      testTimeout: options.testTimeout ?? DEFAULT_TEST_TIMEOUT,
      bail: options.bail,
    }),
  );

  return {
    projectDir: outputDir,
    configFile,
    generatedDir,
    yamlCases,
    testFiles,
  };
}
