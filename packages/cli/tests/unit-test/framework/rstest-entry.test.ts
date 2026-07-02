import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type RstestTest, defineYamlCaseTest } from '@/framework/rstest-entry';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rstestTest: vi.fn(),
  runYamlCaseResult: vi.fn(),
}));

vi.mock('@rstest/core', () => ({
  test: mocks.rstestTest,
}));

vi.mock('@/framework/yaml-case', () => ({
  runYamlCaseResult: mocks.runYamlCaseResult,
  createYamlCaseFailure: (result: { error?: string }) =>
    new Error(result.error || 'YAML case failed'),
}));

const createTempDir = () =>
  mkdtempSync(join(tmpdir(), 'midscene-rstest-entry-'));

const injectedRstestTest = () => mocks.rstestTest as unknown as RstestTest;

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

  test('writes the Rstest test name into case result metadata', async () => {
    const root = createTempDir();
    const feature = join(root, 'checkout.feature');
    const resultFile = join(root, 'results', 'checkout-add-item.json');
    writeFileSync(
      feature,
      'Feature: Checkout\nScenario: Add item\nGiven I open the page\n',
    );
    mocks.runYamlCaseResult.mockResolvedValueOnce({
      file: feature,
      success: true,
      executed: true,
      duration: 10,
      resultType: 'success',
    });

    try {
      defineYamlCaseTest(injectedRstestTest(), {
        testName: 'features/checkout.feature > Checkout > Add item',
        yamlFile: feature,
        resultFile,
      });

      const [, runCase] = mocks.rstestTest.mock.calls[0];
      await expect(runCase()).resolves.toBeUndefined();

      const result = JSON.parse(readFileSync(resultFile, 'utf8'));
      expect(result).toMatchObject({
        file: feature,
        testName: 'features/checkout.feature > Checkout > Add item',
        success: true,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
