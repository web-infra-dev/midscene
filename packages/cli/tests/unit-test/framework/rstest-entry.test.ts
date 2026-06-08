import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineYamlCaseTest } from '@/framework/rstest-entry';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  test: vi.fn(),
  runYamlCaseResult: vi.fn(),
}));

vi.mock('@rstest/core', () => ({
  test: mocks.test,
}));

vi.mock('@/framework/yaml-case', () => ({
  runYamlCaseResult: mocks.runYamlCaseResult,
  createYamlCaseFailure: (result: { error?: string }) =>
    new Error(result.error || 'YAML case failed'),
}));

const createTempDir = () =>
  mkdtempSync(join(tmpdir(), 'midscene-rstest-entry-'));

describe('defineYamlCaseTest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('preserves failed attempts when Rstest retries a YAML case', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const resultFile = join(root, 'results', 'case.json');
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');

    mocks.runYamlCaseResult
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
      defineYamlCaseTest({
        testName: 'case',
        yamlFile: yaml,
        resultFile,
      });

      const [, runCase] = mocks.test.mock.calls[0];
      await expect(runCase()).rejects.toThrow('first attempt failed');
      await expect(runCase()).resolves.toBeUndefined();

      const result = JSON.parse(readFileSync(resultFile, 'utf8'));
      expect(result.success).toBe(true);
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

  test('throws for partialFailed results so Rstest can retry them', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const resultFile = join(root, 'results', 'case.json');
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');

    mocks.runYamlCaseResult.mockResolvedValueOnce({
      file: yaml,
      success: false,
      executed: true,
      report: join(root, 'report', 'partial.html'),
      error: 'task failed with continue-on-error',
      duration: 11,
      resultType: 'partialFailed',
    });

    try {
      defineYamlCaseTest({
        testName: 'case',
        yamlFile: yaml,
        resultFile,
      });

      const [, runCase] = mocks.test.mock.calls[0];
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
});
