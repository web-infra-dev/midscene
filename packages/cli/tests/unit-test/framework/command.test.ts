import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runFrameworkTestConfig } from '@/framework/command';
import { describe, expect, test } from 'vitest';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'midscene-command-'));

describe('framework test command', () => {
  test('runs an existing CLI config through Rstest and writes the summary file', async () => {
    const root = createTempDir();
    const runDir = join(root, 'midscene-run');
    const outputDir = join(root, 'generated-runner');
    const yaml = join(root, 'case.yaml');
    const framework = join(root, 'framework.ts');
    const marker = join(root, 'execution-config.json');
    const outputArtifact = join(runDir, 'output', 'case-output.json');
    const reportArtifact = join(runDir, 'report', 'case-report.html');
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;

    process.env.MIDSCENE_RUN_DIR = runDir;
    writeFileSync(yaml, 'web:\n  url: https://file.example\ntasks: []\n');
    writeFileSync(
      framework,
      `import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test } from '@rstest/core';
export function defineYamlCaseTest(options: any) {
  test(options.testName, async () => {
  mkdirSync(dirname(options.resultFile), { recursive: true });
  writeFileSync(${JSON.stringify(marker)}, JSON.stringify({
    globalConfig: options.caseOptions.globalConfig,
    headed: options.webRuntimeOptions.headed,
    keepWindow: options.webRuntimeOptions.keepWindow
  }));
  writeFileSync(options.resultFile, JSON.stringify({
    file: options.yamlFile,
    success: true,
    executed: true,
    output: ${JSON.stringify(outputArtifact)},
    report: ${JSON.stringify(reportArtifact)},
    duration: 12,
    resultType: 'success'
  }));
  });
}
`,
    );

    try {
      const exitCode = await runFrameworkTestConfig(
        {
          files: [yaml],
          concurrent: 2,
          continueOnError: false,
          summary: 'summary.json',
          shareBrowserContext: false,
          globalConfig: {
            web: {
              viewportWidth: 1280,
            },
          },
          headed: true,
          keepWindow: false,
          dotenvOverride: false,
          dotenvDebug: false,
        },
        {
          outputDir,
          frameworkImport: framework,
          stdio: 'pipe',
        },
      );

      expect(exitCode).toBe(0);
      expect(JSON.parse(readFileSync(marker, 'utf8'))).toMatchObject({
        globalConfig: {
          web: {
            viewportWidth: 1280,
          },
        },
        headed: true,
        keepWindow: false,
      });
      const summary = JSON.parse(
        readFileSync(join(runDir, 'output', 'summary.json'), 'utf8'),
      );
      expect(summary.summary.successful).toBe(1);
      expect(summary.results[0].success).toBe(true);
      expect(summary.results[0].output).toBe('./case-output.json');
      expect(summary.results[0].report).toBe('../report/case-report.html');
    } finally {
      if (previousRunDir === undefined) {
        Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
      } else {
        process.env.MIDSCENE_RUN_DIR = previousRunDir;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('uses one batch virtual entry when shareBrowserContext is enabled', async () => {
    const root = createTempDir();
    const outputDir = join(root, 'generated-runner');
    const yamlA = join(root, 'login.yaml');
    const yamlB = join(root, 'check-login.yaml');
    writeFileSync(yamlA, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(yamlB, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      const exitCode = await runFrameworkTestConfig(
        {
          files: [yamlA, yamlB],
          concurrent: 3,
          continueOnError: true,
          summary: 'summary.json',
          shareBrowserContext: true,
          globalConfig: {
            web: {
              url: 'https://example.com',
            },
          },
          headed: false,
          keepWindow: false,
          dotenvOverride: false,
          dotenvDebug: false,
        },
        {
          outputDir,
          frameworkImport: '@test/framework',
          stdio: 'pipe',
          rstestRunner: async ({ project }) => {
            expect(project.include).toEqual([
              'virtual:midscene-yaml/batch.test.ts',
            ]);
            expect(project.maxConcurrency).toBe(1);
            const batchModule = project.virtualModules[project.include[0]];
            expect(batchModule).toContain('defineYamlBatchTest');
            expect(batchModule).toContain('"concurrent": 3');
            expect(batchModule).toContain('"shareBrowserContext": true');
            expect(project.cases.map((item) => item.yamlFile)).toEqual([
              yamlA,
              yamlB,
            ]);
            for (const item of project.cases) {
              mkdirSync(dirname(item.resultFile), { recursive: true });
              writeFileSync(
                item.resultFile,
                JSON.stringify({
                  file: item.yamlFile,
                  success: true,
                  executed: true,
                  duration: 1,
                  resultType: 'success',
                }),
              );
            }
            return 0;
          },
        },
      );
      expect(exitCode).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('lets Rstest schedule virtual entries by concurrency and stops after failure', async () => {
    const root = createTempDir();
    const runDir = join(root, 'midscene-run');
    const outputDir = join(root, 'generated-runner');
    const yamlA = join(root, 'a.yaml');
    const yamlB = join(root, 'b.yaml');
    const yamlC = join(root, 'c.yaml');
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;
    const includes: string[][] = [];

    process.env.MIDSCENE_RUN_DIR = runDir;
    writeFileSync(yamlA, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(yamlB, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(yamlC, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      const exitCode = await runFrameworkTestConfig(
        {
          files: [yamlA, yamlB, yamlC],
          concurrent: 1,
          continueOnError: false,
          summary: 'summary.json',
          shareBrowserContext: false,
          globalConfig: {},
          headed: false,
          keepWindow: false,
          dotenvOverride: false,
          dotenvDebug: false,
        },
        {
          outputDir,
          frameworkImport: '@test/framework',
          stdio: 'pipe',
          rstestRunner: async ({ project }) => {
            includes.push(project.include);
            for (const item of project.cases) {
              const shouldSkip = item.yamlFile === yamlC;
              if (shouldSkip) {
                continue;
              }
              const shouldFail = item.yamlFile === yamlB;
              mkdirSync(dirname(item.resultFile), { recursive: true });
              writeFileSync(
                item.resultFile,
                JSON.stringify({
                  file: item.yamlFile,
                  success: !shouldFail,
                  executed: true,
                  duration: 1,
                  resultType: shouldFail ? 'failed' : 'success',
                  error: shouldFail ? 'failed by test' : undefined,
                }),
              );
            }
            return 1;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(includes).toEqual([
        [
          'virtual:midscene-yaml/001-a.test.ts',
          'virtual:midscene-yaml/002-b.test.ts',
          'virtual:midscene-yaml/003-c.test.ts',
        ],
      ]);
      const summary = JSON.parse(
        readFileSync(join(runDir, 'output', 'summary.json'), 'utf8'),
      );
      expect(summary.summary).toMatchObject({
        successful: 1,
        failed: 1,
        notExecuted: 1,
      });
      expect(summary.results[2].resultType).toBe('notExecuted');
      expect(summary.results[2].error).toBe(
        'Not executed (previous task failed)',
      );
    } finally {
      if (previousRunDir === undefined) {
        Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
      } else {
        process.env.MIDSCENE_RUN_DIR = previousRunDir;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('continues after partialFailed files but exits non-zero from summary', async () => {
    const root = createTempDir();
    const runDir = join(root, 'midscene-run');
    const outputDir = join(root, 'generated-runner');
    const yamlA = join(root, 'a.yaml');
    const yamlB = join(root, 'b.yaml');
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;
    const includes: string[][] = [];

    process.env.MIDSCENE_RUN_DIR = runDir;
    writeFileSync(yamlA, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(yamlB, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      const exitCode = await runFrameworkTestConfig(
        {
          files: [yamlA, yamlB],
          concurrent: 1,
          continueOnError: false,
          summary: 'summary.json',
          shareBrowserContext: false,
          globalConfig: {},
          headed: false,
          keepWindow: false,
          dotenvOverride: false,
          dotenvDebug: false,
        },
        {
          outputDir,
          frameworkImport: '@test/framework',
          stdio: 'pipe',
          rstestRunner: async ({ project }) => {
            includes.push(project.include);
            for (const item of project.cases) {
              const isPartial = item.yamlFile === yamlA;
              mkdirSync(dirname(item.resultFile), { recursive: true });
              writeFileSync(
                item.resultFile,
                JSON.stringify({
                  file: item.yamlFile,
                  success: !isPartial,
                  executed: true,
                  duration: 1,
                  resultType: isPartial ? 'partialFailed' : 'success',
                  error: isPartial ? 'soft assertion failed' : undefined,
                }),
              );
            }
            return 0;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(includes).toEqual([
        [
          'virtual:midscene-yaml/001-a.test.ts',
          'virtual:midscene-yaml/002-b.test.ts',
        ],
      ]);
      const summary = JSON.parse(
        readFileSync(join(runDir, 'output', 'summary.json'), 'utf8'),
      );
      expect(summary.summary).toMatchObject({
        successful: 1,
        failed: 0,
        partialFailed: 1,
        notExecuted: 0,
      });
    } finally {
      if (previousRunDir === undefined) {
        Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
      } else {
        process.env.MIDSCENE_RUN_DIR = previousRunDir;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('runs all virtual entries when continueOnError is enabled', async () => {
    const root = createTempDir();
    const runDir = join(root, 'midscene-run');
    const outputDir = join(root, 'generated-runner');
    const yamlA = join(root, 'a.yaml');
    const yamlB = join(root, 'b.yaml');
    const yamlC = join(root, 'c.yaml');
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;
    const includes: string[][] = [];

    process.env.MIDSCENE_RUN_DIR = runDir;
    writeFileSync(yamlA, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(yamlB, 'web:\n  url: about:blank\ntasks: []\n');
    writeFileSync(yamlC, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      const exitCode = await runFrameworkTestConfig(
        {
          files: [yamlA, yamlB, yamlC],
          concurrent: 1,
          continueOnError: true,
          summary: 'summary.json',
          shareBrowserContext: false,
          globalConfig: {},
          headed: false,
          keepWindow: false,
          dotenvOverride: false,
          dotenvDebug: false,
        },
        {
          outputDir,
          frameworkImport: '@test/framework',
          stdio: 'pipe',
          rstestRunner: async ({ project }) => {
            includes.push(project.include);
            for (const item of project.cases) {
              const shouldFail = item.yamlFile === yamlA;
              mkdirSync(dirname(item.resultFile), { recursive: true });
              writeFileSync(
                item.resultFile,
                JSON.stringify({
                  file: item.yamlFile,
                  success: !shouldFail,
                  executed: true,
                  duration: 1,
                  resultType: shouldFail ? 'failed' : 'success',
                  error: shouldFail ? 'failed by test' : undefined,
                }),
              );
            }
            return 1;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(includes).toEqual([
        [
          'virtual:midscene-yaml/001-a.test.ts',
          'virtual:midscene-yaml/002-b.test.ts',
          'virtual:midscene-yaml/003-c.test.ts',
        ],
      ]);
      const summary = JSON.parse(
        readFileSync(join(runDir, 'output', 'summary.json'), 'utf8'),
      );
      expect(summary.summary).toMatchObject({
        successful: 2,
        failed: 1,
        notExecuted: 0,
      });
    } finally {
      if (previousRunDir === undefined) {
        Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
      } else {
        process.env.MIDSCENE_RUN_DIR = previousRunDir;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('passes all virtual entries to one Rstest project with configured concurrency', async () => {
    const root = createTempDir();
    const outputDir = join(root, 'generated-runner');
    const yamlFiles = ['a.yaml', 'b.yaml', 'c.yaml', 'd.yaml', 'e.yaml'].map(
      (name) => join(root, name),
    );
    const includes: string[][] = [];

    for (const file of yamlFiles) {
      writeFileSync(file, 'web:\n  url: about:blank\ntasks: []\n');
    }

    try {
      const exitCode = await runFrameworkTestConfig(
        {
          files: yamlFiles,
          concurrent: 2,
          continueOnError: false,
          summary: 'summary.json',
          shareBrowserContext: false,
          globalConfig: {},
          headed: false,
          keepWindow: false,
          dotenvOverride: false,
          dotenvDebug: false,
        },
        {
          outputDir,
          frameworkImport: '@test/framework',
          stdio: 'pipe',
          rstestRunner: async ({ project }) => {
            includes.push(project.include);
            expect(project.maxConcurrency).toBe(2);
            for (const item of project.cases) {
              mkdirSync(dirname(item.resultFile), { recursive: true });
              writeFileSync(
                item.resultFile,
                JSON.stringify({
                  file: item.yamlFile,
                  success: true,
                  executed: true,
                  duration: 1,
                  resultType: 'success',
                }),
              );
            }
            return 0;
          },
        },
      );

      expect(exitCode).toBe(0);
      expect(includes).toEqual([
        [
          'virtual:midscene-yaml/001-a.test.ts',
          'virtual:midscene-yaml/002-b.test.ts',
          'virtual:midscene-yaml/003-c.test.ts',
          'virtual:midscene-yaml/004-d.test.ts',
          'virtual:midscene-yaml/005-e.test.ts',
        ],
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps completed files in a failing concurrency batch', async () => {
    const root = createTempDir();
    const runDir = join(root, 'midscene-run');
    const outputDir = join(root, 'generated-runner');
    const yamlA = join(root, 'a.yaml');
    const yamlB = join(root, 'b.yaml');
    const yamlC = join(root, 'c.yaml');
    const yamlD = join(root, 'd.yaml');
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;
    const includes: string[][] = [];

    process.env.MIDSCENE_RUN_DIR = runDir;
    for (const file of [yamlA, yamlB, yamlC, yamlD]) {
      writeFileSync(file, 'web:\n  url: about:blank\ntasks: []\n');
    }

    try {
      const exitCode = await runFrameworkTestConfig(
        {
          files: [yamlA, yamlB, yamlC, yamlD],
          concurrent: 2,
          continueOnError: false,
          summary: 'summary.json',
          shareBrowserContext: false,
          globalConfig: {},
          headed: false,
          keepWindow: false,
          dotenvOverride: false,
          dotenvDebug: false,
        },
        {
          outputDir,
          frameworkImport: '@test/framework',
          stdio: 'pipe',
          rstestRunner: async ({ project }) => {
            includes.push(project.include);
            for (const item of project.cases) {
              if (item.yamlFile === yamlC || item.yamlFile === yamlD) {
                continue;
              }
              const shouldFail = item.yamlFile === yamlA;
              mkdirSync(dirname(item.resultFile), { recursive: true });
              writeFileSync(
                item.resultFile,
                JSON.stringify({
                  file: item.yamlFile,
                  success: !shouldFail,
                  executed: true,
                  duration: 1,
                  resultType: shouldFail ? 'failed' : 'success',
                  error: shouldFail ? 'failed by test' : undefined,
                }),
              );
            }
            return 1;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(includes).toEqual([
        [
          'virtual:midscene-yaml/001-a.test.ts',
          'virtual:midscene-yaml/002-b.test.ts',
          'virtual:midscene-yaml/003-c.test.ts',
          'virtual:midscene-yaml/004-d.test.ts',
        ],
      ]);
      const summary = JSON.parse(
        readFileSync(join(runDir, 'output', 'summary.json'), 'utf8'),
      );
      expect(summary.summary).toMatchObject({
        successful: 1,
        failed: 1,
        notExecuted: 2,
      });
      expect(summary.results[1]).toMatchObject({
        script: expect.stringContaining('b.yaml'),
        success: true,
        resultType: 'success',
      });
    } finally {
      if (previousRunDir === undefined) {
        Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
      } else {
        process.env.MIDSCENE_RUN_DIR = previousRunDir;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
