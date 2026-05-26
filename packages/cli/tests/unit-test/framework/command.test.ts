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
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;

    process.env.MIDSCENE_RUN_DIR = runDir;
    writeFileSync(yaml, 'web:\n  url: https://file.example\ntasks: []\n');
    writeFileSync(
      framework,
      `import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
export async function runYamlCaseInChildProcess(options: any) {
  mkdirSync(dirname(options.resultFile), { recursive: true });
  writeFileSync(${JSON.stringify(marker)}, JSON.stringify(options.globalConfig));
  writeFileSync(options.resultFile, JSON.stringify({
    file: options.file,
    success: true,
    executed: true,
    output: null,
    report: null,
    duration: 12,
    resultType: 'success'
  }));
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
        web: {
          viewportWidth: 1280,
        },
      });
      const summary = JSON.parse(
        readFileSync(join(runDir, 'output', 'summary.json'), 'utf8'),
      );
      expect(summary.summary.successful).toBe(1);
      expect(summary.results[0].success).toBe(true);
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
          concurrent: 1,
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
              'virtual/midscene-yaml/batch.test.ts',
            ]);
            const batchModule = project.virtualModules[project.include[0]];
            expect(batchModule).toContain('runYamlBatchInRstest');
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
});
