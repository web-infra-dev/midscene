import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runFrameworkTestConfigDetailed } from '@/framework/command';
import { describe, expect, rs, test } from '@rstest/core';

const createTempDir = () =>
  mkdtempSync(join(tmpdir(), 'midscene-command-json-'));

describe('framework command JSON output', () => {
  test('returns results without human logs', async () => {
    const root = createTempDir();
    const runDir = join(root, 'midscene-run');
    const outputDir = join(root, 'generated-runner');
    const yaml = join(root, 'case.yaml');
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;
    const consoleLog = rs.spyOn(console, 'log').mockImplementation(() => {});

    process.env.MIDSCENE_RUN_DIR = runDir;
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');

    try {
      const result = await runFrameworkTestConfigDetailed(
        {
          files: [yaml],
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
          outputMode: 'json',
          rstestRunner: async ({ project, stdio }) => {
            expect(stdio).toBe('pipe');
            expect(project.bail).toBe(0);
            expect(project.modules).toHaveLength(1);
            expect(project.modules[0].id).toBe(
              'virtual:midscene-yaml/batch.test.ts',
            );
            mkdirSync(dirname(project.cases[0].resultFile), {
              recursive: true,
            });
            writeFileSync(
              project.cases[0].resultFile,
              JSON.stringify({
                file: yaml,
                success: true,
                executed: true,
                duration: 5,
                resultType: 'success',
              }),
            );
            return 0;
          },
        },
      );

      expect(result).toEqual({
        exitCode: 0,
        results: [
          {
            file: yaml,
            success: true,
            executed: true,
            duration: 5,
            resultType: 'success',
          },
        ],
        summaryPath: join(runDir, 'output', 'summary.json'),
      });
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
      if (previousRunDir === undefined) {
        Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
      } else {
        process.env.MIDSCENE_RUN_DIR = previousRunDir;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects keepWindow because the command would not terminate', async () => {
    await expect(
      runFrameworkTestConfigDetailed(
        {
          files: ['/tmp/case.yaml'],
          concurrent: 1,
          continueOnError: false,
          summary: 'summary.json',
          shareBrowserContext: false,
          globalConfig: {},
          headed: true,
          keepWindow: true,
          dotenvOverride: false,
          dotenvDebug: false,
        },
        { outputMode: 'json' },
      ),
    ).rejects.toThrow(
      'JSON output mode cannot be used when keepWindow is enabled because the command does not terminate.',
    );
  });
});
