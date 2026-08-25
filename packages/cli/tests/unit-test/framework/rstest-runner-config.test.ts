import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRstestYamlProject } from '@/framework/rstest-runner';
import { describe, expect, rs, test } from '@rstest/core';

const mocks = rs.hoisted(() => ({
  runRstest: rs.fn(),
}));

rs.mock('@rstest/core/api', () => ({
  runRstest: mocks.runRstest,
}));

describe('rstest runner config', () => {
  test('uses the Midscene YAML progress reporter by default', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    mocks.runRstest.mockResolvedValue({ ok: true, unhandledErrors: [] });

    try {
      const exitCode = await runRstestYamlProject({
        cwd: root,
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          modules: [
            {
              id: 'virtual:a.test.ts',
              source: 'export {};',
              caseIds: [],
            },
          ],
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
        },
      });

      expect(exitCode).toBe(0);
      const inlineConfig = mocks.runRstest.mock.calls[0]?.[0].inlineConfig;
      expect(inlineConfig.reporters).toEqual([
        expect.objectContaining({
          onUserConsoleLog: expect.any(Function),
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('suppresses reporter output when stdio is piped', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    mocks.runRstest.mockResolvedValue({ ok: true, unhandledErrors: [] });

    try {
      await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          include: ['virtual:a.test.ts'],
          virtualModules: {
            'virtual:a.test.ts': 'export {};',
          },
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
        },
      });

      const inlineConfig = mocks.runRstest.mock.calls.at(-1)?.[0].inlineConfig;
      expect(inlineConfig.reporters).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('forwards a positive retry count to Rstest', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    mocks.runRstest.mockResolvedValue({ ok: true, unhandledErrors: [] });

    try {
      await runRstestYamlProject({
        cwd: root,
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          modules: [
            {
              id: 'virtual:a.test.ts',
              source: 'export {};',
              caseIds: [],
            },
          ],
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
          retry: 2,
        },
      });

      expect(mocks.runRstest).toHaveBeenCalledWith(
        expect.objectContaining({
          inlineConfig: expect.objectContaining({
            retry: 2,
          }),
        }),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('omits retry when it is zero or undefined', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    mocks.runRstest.mockResolvedValue({ ok: true, unhandledErrors: [] });

    try {
      await runRstestYamlProject({
        cwd: root,
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          modules: [
            {
              id: 'virtual:a.test.ts',
              source: 'export {};',
              caseIds: [],
            },
          ],
          cases: [],
          maxConcurrency: 1,
          testTimeout: 0,
          retry: 0,
        },
      });

      const inlineConfig = mocks.runRstest.mock.calls.at(-1)?.[0].inlineConfig;
      expect(inlineConfig).not.toHaveProperty('retry');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('records an unhandled failure for every case in a single generated module', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
    const caseA = {
      caseId: '001-a',
      testName: 'a.yaml',
      yamlFile: join(root, 'a.yaml'),
      resultFile: join(root, 'results', '001-a.json'),
    };
    const caseB = {
      caseId: '002-b',
      testName: 'b.yaml',
      yamlFile: join(root, 'b.yaml'),
      resultFile: join(root, 'results', '002-b.json'),
    };
    mocks.runRstest.mockResolvedValue({
      ok: false,
      files: [],
      unhandledErrors: [
        {
          name: 'Error',
          message: 'worker crashed before collecting tests',
        },
      ],
    });

    try {
      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project: {
          projectDir: root,
          outputDir: join(root, 'output'),
          resultDir: join(root, 'results'),
          modules: [
            {
              id: 'virtual:ordered.test.ts',
              source: 'export {};',
              caseIds: [caseA.caseId, caseB.caseId],
            },
          ],
          cases: [caseA, caseB],
          maxConcurrency: 1,
          testTimeout: 0,
        },
      });

      expect(exitCode).toBe(1);
      for (const item of [caseA, caseB]) {
        expect(JSON.parse(readFileSync(item.resultFile, 'utf8'))).toMatchObject(
          {
            file: item.yamlFile,
            resultType: 'failed',
            error: 'worker crashed before collecting tests',
          },
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
