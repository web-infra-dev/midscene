import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitYamlProgress } from '@/framework/progress-reporter';
import { runYamlBatchInRstest } from '@/framework/yaml-batch';
import { runYamlBatchWithCaseIds } from '@/yaml-batch-executor';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';

const mocks = rs.hoisted(() => ({
  runYamlBatchWithCaseIds: rs.fn(),
}));

rs.mock('@/yaml-batch-executor', () => ({
  runYamlBatchWithCaseIds: mocks.runYamlBatchWithCaseIds,
}));

const createTempDir = () => mkdtempSync(join(tmpdir(), 'midscene-yaml-batch-'));

const createConfig = (files: string[]) => ({
  files,
  concurrent: 2,
  continueOnError: false,
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
});

describe('runYamlBatchInRstest', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('runs the shared batch executor without duplicate summary output and writes result files', async () => {
    const root = createTempDir();
    const yamlA = join(root, 'login.yaml');
    const yamlB = join(root, 'check.yaml');
    const resultA = join(root, 'results', 'login.json');
    const resultB = join(root, 'results', 'check.json');
    const config = createConfig([yamlA, yamlB]);
    const results: MidsceneYamlConfigResult[] = [
      {
        file: yamlA,
        success: true,
        executed: true,
        duration: 10,
        resultType: 'success',
      },
      {
        file: yamlB,
        success: true,
        executed: true,
        duration: 20,
        resultType: 'success',
      },
    ];
    mocks.runYamlBatchWithCaseIds.mockResolvedValue([
      { caseId: 'case-a', result: results[0] },
      { caseId: 'case-b', result: results[1] },
    ]);

    try {
      await expect(
        runYamlBatchInRstest({
          config,
          resultTargets: [
            { caseId: 'case-a', yamlFile: yamlA, resultFile: resultA },
            { caseId: 'case-b', yamlFile: yamlB, resultFile: resultB },
          ],
        }),
      ).resolves.toEqual(results);

      expect(runYamlBatchWithCaseIds).toHaveBeenCalledWith(
        config,
        ['case-a', 'case-b'],
        {
          generateSummary: false,
          printExecutionPlan: false,
          onProgress: emitYamlProgress,
        },
      );
      expect(JSON.parse(readFileSync(resultA, 'utf8'))).toMatchObject({
        file: yamlA,
        success: true,
        resultType: 'success',
      });
      expect(JSON.parse(readFileSync(resultB, 'utf8'))).toMatchObject({
        file: yamlB,
        success: true,
        resultType: 'success',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('writes all batch results before surfacing aggregated failures', async () => {
    const root = createTempDir();
    const yamlA = join(root, 'failed.yaml');
    const yamlB = join(root, 'partial.yaml');
    const resultA = join(root, 'results', 'failed.json');
    const resultB = join(root, 'results', 'partial.json');
    const config = createConfig([yamlA, yamlB]);
    mocks.runYamlBatchWithCaseIds.mockResolvedValue([
      {
        caseId: 'case-a',
        result: {
          file: yamlA,
          success: false,
          executed: true,
          duration: 10,
          resultType: 'failed',
          error: 'browser crashed',
        },
      },
      {
        caseId: 'case-b',
        result: {
          file: yamlB,
          success: false,
          executed: true,
          duration: 20,
          resultType: 'partialFailed',
        },
      },
    ]);

    try {
      await expect(
        runYamlBatchInRstest({
          config,
          resultTargets: [
            { caseId: 'case-a', yamlFile: yamlA, resultFile: resultA },
            { caseId: 'case-b', yamlFile: yamlB, resultFile: resultB },
          ],
        }),
      ).rejects.toThrow(
        /failed\.yaml: browser crashed[\s\S]*partial\.yaml: partialFailed/,
      );

      expect(JSON.parse(readFileSync(resultA, 'utf8'))).toMatchObject({
        file: yamlA,
        success: false,
        resultType: 'failed',
        error: 'browser crashed',
      });
      expect(JSON.parse(readFileSync(resultB, 'utf8'))).toMatchObject({
        file: yamlB,
        success: false,
        resultType: 'partialFailed',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('writes duplicate YAML occurrences to distinct result files', async () => {
    const root = createTempDir();
    const yaml = join(root, 'duplicate.yaml');
    const firstResult = join(root, 'results', '001-duplicate.json');
    const secondResult = join(root, 'results', '002-duplicate.json');
    const config = createConfig([yaml, yaml]);
    // Completion order is intentionally reversed. Stable case IDs, rather
    // than result arrival order or file path, must select the result files.
    mocks.runYamlBatchWithCaseIds.mockResolvedValue([
      {
        caseId: 'second-case',
        result: {
          file: yaml,
          success: false,
          executed: true,
          duration: 20,
          resultType: 'failed',
          error: 'second occurrence failed',
        },
      },
      {
        caseId: 'first-case',
        result: {
          file: yaml,
          success: true,
          executed: true,
          duration: 10,
          resultType: 'success',
        },
      },
    ]);

    try {
      await expect(
        runYamlBatchInRstest({
          config,
          resultTargets: [
            {
              caseId: 'first-case',
              yamlFile: yaml,
              resultFile: firstResult,
            },
            {
              caseId: 'second-case',
              yamlFile: yaml,
              resultFile: secondResult,
            },
          ],
        }),
      ).rejects.toThrow('second occurrence failed');

      expect(JSON.parse(readFileSync(firstResult, 'utf8'))).toMatchObject({
        success: true,
        duration: 10,
      });
      expect(JSON.parse(readFileSync(secondResult, 'utf8'))).toMatchObject({
        success: false,
        duration: 20,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('throws when a batch result has no matching output target', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const config = createConfig([yaml]);
    mocks.runYamlBatchWithCaseIds.mockResolvedValue([
      {
        caseId: 'unexpected-case',
        result: {
          file: yaml,
          success: true,
          executed: true,
          duration: 10,
          resultType: 'success',
        },
      },
    ]);

    try {
      await expect(
        runYamlBatchInRstest({ config, resultTargets: [] }),
      ).rejects.toThrow(
        'Batch result mapping mismatch: 1 result(s) had no target and 0 target(s) had no result',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
