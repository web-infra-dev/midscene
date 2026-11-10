import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RSTEST_YAML_CASE_IDS_META_KEY } from '@/framework/rstest-contract';
import type { GeneratedRstestYamlProject } from '@/framework/rstest-project';
import { runRstestYamlProject } from '@/framework/rstest-runner';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';

const mocks = rs.hoisted(() => ({
  createRstest: rs.fn(),
  run: rs.fn(),
}));

rs.mock('@rstest/core/api', () => ({
  createRstest: mocks.createRstest,
}));

const withTempRoot = async (
  fn: (root: string) => Promise<void>,
): Promise<void> => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-rstest-config-'));
  try {
    await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const makeProject = (
  root: string,
  overrides: Partial<GeneratedRstestYamlProject> = {},
): GeneratedRstestYamlProject => ({
  projectDir: root,
  outputDir: join(root, 'output'),
  resultDir: join(root, 'results'),
  modules: [{ id: 'virtual:a.test.ts', source: 'export {};', caseIds: [] }],
  cases: [],
  maxConcurrency: 1,
  testTimeout: 0,
  ...overrides,
});

describe('rstest runner config', () => {
  beforeEach(() => {
    mocks.createRstest.mockReset();
    mocks.createRstest.mockResolvedValue({ run: mocks.run });
    mocks.run.mockResolvedValue({
      status: 'pass',
      results: [],
      unhandledErrors: [],
    });
  });

  test('uses the YAML progress reporter unless stdio is piped', async () => {
    await withTempRoot(async (root) => {
      const project = makeProject(root);
      const exitCode = await runRstestYamlProject({ cwd: root, project });

      expect(exitCode).toBe(0);
      expect(mocks.createRstest.mock.calls[0]?.[0].config.reporters).toEqual([
        expect.objectContaining({ onUserConsoleLog: expect.any(Function) }),
      ]);

      await runRstestYamlProject({ cwd: root, stdio: 'pipe', project });
      expect(
        mocks.createRstest.mock.calls.at(-1)?.[0].config.reporters,
      ).toEqual([]);
    });
  });

  test.each([undefined, 0, 2])('configures retry for %s', async (retry) => {
    await withTempRoot(async (root) => {
      await runRstestYamlProject({
        cwd: root,
        project: makeProject(root, { retry }),
      });

      const config = mocks.createRstest.mock.calls[0]?.[0].config;
      if (retry === 2) {
        expect(config.retry).toBe(2);
      } else {
        expect(config).not.toHaveProperty('retry');
      }
    });
  });

  test('records a worker crash for pending cases after an earlier test failure', async () => {
    await withTempRoot(async (root) => {
      const moduleId = 'virtual:ordered.test.ts';
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
      mocks.run.mockResolvedValue({
        status: 'error',
        results: [
          {
            name: moduleId,
            testPath: moduleId,
            errors: [],
            results: [
              {
                name: caseA.testName,
                meta: {
                  [RSTEST_YAML_CASE_IDS_META_KEY]: [caseA.caseId],
                },
                errors: [{ name: 'Error', message: 'first case failed' }],
              },
            ],
          },
        ],
        unhandledErrors: [
          {
            name: 'Error',
            message: 'worker crashed while starting the next case',
          },
        ],
      });

      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project: makeProject(root, {
          modules: [
            {
              id: moduleId,
              source: 'export {};',
              caseIds: [caseA.caseId, caseB.caseId],
            },
          ],
          cases: [caseA, caseB],
        }),
      });

      expect(exitCode).toBe(1);
      expect(JSON.parse(readFileSync(caseA.resultFile, 'utf8'))).toMatchObject({
        file: caseA.yamlFile,
        resultType: 'failed',
        error: 'first case failed',
      });
      expect(JSON.parse(readFileSync(caseB.resultFile, 'utf8'))).toMatchObject({
        file: caseB.yamlFile,
        resultType: 'failed',
        error: 'worker crashed while starting the next case',
      });
    });
  });

  test('records a run-level error for pending cases across modules', async () => {
    await withTempRoot(async (root) => {
      const cases = ['a', 'b', 'c'].map((name, index) => ({
        caseId: `00${index + 1}-${name}`,
        testName: `${name}.yaml`,
        yamlFile: join(root, `${name}.yaml`),
        resultFile: join(root, 'results', `00${index + 1}-${name}.json`),
      }));
      const [caseA, caseB, caseC] = cases;
      const completed = {
        file: caseA.yamlFile,
        success: true,
        executed: true,
        output: undefined,
        report: undefined,
        duration: 12,
        resultType: 'passed',
      };
      mkdirSync(join(root, 'results'), { recursive: true });
      writeFileSync(caseA.resultFile, JSON.stringify(completed, null, 2));

      mocks.run.mockResolvedValue({
        status: 'error',
        results: [],
        unhandledErrors: [
          {
            name: 'Error',
            message: 'rspack failed to compile the virtual modules',
          },
        ],
      });

      const exitCode = await runRstestYamlProject({
        cwd: root,
        stdio: 'pipe',
        project: makeProject(root, {
          modules: cases.map((item) => ({
            id: `virtual:${item.caseId}.test.ts`,
            source: 'export {};',
            caseIds: [item.caseId],
          })),
          cases,
          maxConcurrency: 3,
        }),
      });

      expect(exitCode).toBe(1);
      for (const item of [caseB, caseC]) {
        expect(JSON.parse(readFileSync(item.resultFile, 'utf8'))).toMatchObject(
          {
            file: item.yamlFile,
            success: false,
            executed: true,
            resultType: 'failed',
            error: 'rspack failed to compile the virtual modules',
          },
        );
      }
      expect(JSON.parse(readFileSync(caseA.resultFile, 'utf8'))).toEqual(
        JSON.parse(JSON.stringify(completed)),
      );
    });
  });

  test('prints distinct file, test, and run errors with a fallback name', async () => {
    await withTempRoot(async (root) => {
      const consoleError = rs
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mocks.run.mockResolvedValue({
        status: 'error',
        results: [
          {
            name: 'virtual:a.test.ts',
            testPath: 'virtual:a.test.ts',
            errors: [{ message: 'boom' }, { message: 'boom' }],
            results: [
              {
                name: 'a.yaml',
                errors: [
                  { name: 'Error', message: 'case failed' },
                  { name: 'Error', message: 'case failed' },
                ],
              },
            ],
          },
        ],
        unhandledErrors: [{ name: 'Error', message: 'worker crashed' }],
      });

      try {
        const exitCode = await runRstestYamlProject({
          cwd: root,
          project: makeProject(root),
        });

        expect(exitCode).toBe(1);
        expect(consoleError).toHaveBeenCalledTimes(1);
        expect(consoleError).toHaveBeenCalledWith(
          '\nYAML execution failed:\nvirtual:a.test.ts: Error: boom\n\na.yaml: Error: case failed\n\nError: worker crashed',
        );
        expect(consoleError.mock.calls[0]?.[0]).not.toContain(
          'undefined: boom',
        );
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  test('records a rejected run for every case and prints the error', async () => {
    await withTempRoot(async (root) => {
      const cases = ['a', 'b'].map((name) => ({
        caseId: name,
        testName: `${name}.yaml`,
        yamlFile: join(root, `${name}.yaml`),
        resultFile: join(root, 'results', `${name}.json`),
      }));
      const consoleError = rs
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mocks.run.mockRejectedValue(new Error('compile failed'));

      try {
        const exitCode = await runRstestYamlProject({
          cwd: root,
          project: makeProject(root, {
            modules: cases.map((item) => ({
              id: `virtual:${item.caseId}.test.ts`,
              source: 'export {};',
              caseIds: [item.caseId],
            })),
            cases,
            maxConcurrency: 2,
          }),
        });

        expect(exitCode).toBe(1);
        for (const item of cases) {
          expect(
            JSON.parse(readFileSync(item.resultFile, 'utf8')),
          ).toMatchObject({
            file: item.yamlFile,
            success: false,
            executed: true,
            resultType: 'failed',
            error: 'compile failed',
          });
        }
        expect(consoleError).toHaveBeenCalledWith(
          expect.stringContaining('compile failed'),
        );
      } finally {
        consoleError.mockRestore();
      }
    });
  });
});
