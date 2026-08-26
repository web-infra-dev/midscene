import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type RstestTest, defineYamlCaseTest } from '@/framework/rstest-entry';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';

const mocks = rs.hoisted(() => ({
  emitYamlProgress: rs.fn(),
  rstestTest: rs.fn(),
  runYamlCaseResultWithSnapshots: rs.fn(),
}));

rs.mock('@rstest/core', () => ({
  test: mocks.rstestTest,
}));

rs.mock('@/framework/yaml-case', () => ({
  runYamlCaseResultWithSnapshots: mocks.runYamlCaseResultWithSnapshots,
  createYamlCaseFailure: (result: { error?: string }) =>
    new Error(result.error || 'YAML case failed'),
}));

rs.mock('@/framework/progress-reporter', () => ({
  emitYamlProgress: mocks.emitYamlProgress,
}));

const createTempDir = () =>
  mkdtempSync(join(tmpdir(), 'midscene-rstest-entry-'));

const injectedRstestTest = () => mocks.rstestTest as unknown as RstestTest;

describe('defineYamlCaseTest', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('preserves failed attempts when Rstest retries a YAML case', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const resultFile = join(root, 'results', 'case.json');
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');

    mocks.runYamlCaseResultWithSnapshots
      .mockResolvedValueOnce({
        file: yaml,
        success: false,
        executed: true,
        report: join(root, 'report', 'attempt-1.html'),
        error: 'first attempt failed',
        duration: 11,
        resultType: 'failed',
      })
      .mockResolvedValueOnce({
        file: yaml,
        success: true,
        executed: true,
        report: join(root, 'report', 'attempt-2.html'),
        duration: 12,
        resultType: 'success',
      });

    try {
      defineYamlCaseTest(injectedRstestTest(), {
        testName: 'case',
        yamlFile: yaml,
        resultFile,
      });

      const [, runCase] = mocks.rstestTest.mock.calls[0];
      await expect(runCase()).rejects.toThrow('first attempt failed');
      await expect(runCase()).resolves.toBeUndefined();

      const result = JSON.parse(readFileSync(resultFile, 'utf8'));
      expect(result.success).toBe(true);
      expect(result.duration).toBe(23);
      expect(result.attempts).toMatchObject([
        {
          attempt: 1,
          success: false,
          error: 'first attempt failed',
          resultType: 'failed',
        },
        {
          attempt: 2,
          success: true,
          resultType: 'success',
        },
      ]);
      expect(existsSync(`${resultFile}.attempts.json`)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('preserves reports that reuse an explicit reportFileName across retries', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const resultFile = join(root, 'results', 'case.json');
    const reportFile = join(root, 'report', 'custom-report.html');
    writeFileSync(
      yaml,
      'web:\n  url: about:blank\nagent:\n  reportFileName: custom-report\ntasks: []\n',
    );
    let runCount = 0;
    mocks.runYamlCaseResultWithSnapshots.mockImplementation(async () => {
      runCount++;
      mkdirSync(join(root, 'report'), { recursive: true });
      writeFileSync(reportFile, `attempt ${runCount}`);
      return {
        file: yaml,
        success: runCount > 1,
        executed: true,
        report: reportFile,
        error: runCount === 1 ? 'first attempt failed' : undefined,
        duration: runCount === 1 ? 11 : 12,
        resultType: runCount === 1 ? 'failed' : 'success',
      };
    });

    try {
      defineYamlCaseTest(injectedRstestTest(), {
        testName: 'case',
        yamlFile: yaml,
        resultFile,
        retry: 1,
      });

      const [, runCase] = mocks.rstestTest.mock.calls[0];
      await expect(runCase()).rejects.toThrow('first attempt failed');
      await expect(runCase()).resolves.toBeUndefined();

      const result = JSON.parse(readFileSync(resultFile, 'utf8'));
      const archivedReport = join(
        root,
        'report',
        'custom-report-attempt-1.html',
      );
      expect(result).toMatchObject({
        success: true,
        report: reportFile,
        duration: 23,
        attempts: [
          { attempt: 1, report: archivedReport, duration: 11 },
          { attempt: 2, report: reportFile, duration: 12 },
        ],
      });
      expect(readFileSync(archivedReport, 'utf8')).toBe('attempt 1');
      expect(readFileSync(reportFile, 'utf8')).toBe('attempt 2');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('throws for partialFailed results so Rstest can retry them', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const resultFile = join(root, 'results', 'case.json');
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');

    mocks.runYamlCaseResultWithSnapshots.mockResolvedValueOnce({
      file: yaml,
      success: false,
      executed: true,
      report: join(root, 'report', 'partial.html'),
      error: 'task failed with continue-on-error',
      duration: 11,
      resultType: 'partialFailed',
    });

    try {
      defineYamlCaseTest(injectedRstestTest(), {
        testName: 'case',
        yamlFile: yaml,
        resultFile,
      });

      const [, runCase] = mocks.rstestTest.mock.calls[0];
      await expect(runCase()).rejects.toThrow(
        'task failed with continue-on-error',
      );

      const result = JSON.parse(readFileSync(resultFile, 'utf8'));
      expect(result).toMatchObject({
        success: false,
        resultType: 'partialFailed',
        error: 'task failed with continue-on-error',
      });
      expect(result.attempts).toMatchObject([
        {
          attempt: 1,
          success: false,
          resultType: 'partialFailed',
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('forwards named player snapshots to the Rstest progress channel', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const resultFile = join(root, 'results', 'case.json');
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');

    mocks.runYamlCaseResultWithSnapshots.mockImplementationOnce(
      async (_options, onPlayerSnapshot) => {
        onPlayerSnapshot({
          file: yaml,
          player: {
            status: 'init',
            taskStatusList: [
              { name: 'enter recruitment credentials', status: 'init' },
            ],
            result: {},
          },
        });
        return {
          file: yaml,
          success: true,
          executed: true,
          duration: 1,
          resultType: 'success',
        };
      },
    );

    try {
      defineYamlCaseTest(injectedRstestTest(), {
        testName: 'case',
        yamlFile: yaml,
        resultFile,
      });

      const [, runCase] = mocks.rstestTest.mock.calls[0];
      await runCase();

      expect(mocks.emitYamlProgress).toHaveBeenCalledWith(
        expect.stringContaining('enter recruitment credentials'),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('labels player snapshots with the current retry attempt', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const resultFile = join(root, 'results', 'case.json');
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');
    let runCount = 0;

    mocks.runYamlCaseResultWithSnapshots.mockImplementation(
      async (_options, onPlayerSnapshot) => {
        runCount++;
        onPlayerSnapshot({
          file: yaml,
          player: {
            status: runCount === 1 ? 'error' : 'done',
            taskStatusList: [
              {
                name: 'enter recruitment credentials',
                status: runCount === 1 ? 'error' : 'done',
              },
            ],
            result: {},
          },
        });
        return {
          file: yaml,
          success: runCount > 1,
          executed: true,
          duration: runCount,
          resultType: runCount === 1 ? 'failed' : 'success',
          error: runCount === 1 ? 'first attempt failed' : undefined,
        };
      },
    );

    try {
      defineYamlCaseTest(injectedRstestTest(), {
        testName: 'case',
        yamlFile: yaml,
        resultFile,
        retry: 1,
      });

      const [, runCase] = mocks.rstestTest.mock.calls[0];
      await expect(runCase()).rejects.toThrow('first attempt failed');
      await expect(runCase()).resolves.toBeUndefined();

      const progressMessages = mocks.emitYamlProgress.mock.calls.map(
        ([message]) => message,
      );
      expect(progressMessages).toHaveLength(2);
      expect(progressMessages[0]).toContain('Attempt 1/2');
      expect(progressMessages[0]).toContain('enter recruitment credentials');
      expect(progressMessages[1]).toContain('Attempt 2/2');
      expect(progressMessages[1]).toContain('enter recruitment credentials');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
