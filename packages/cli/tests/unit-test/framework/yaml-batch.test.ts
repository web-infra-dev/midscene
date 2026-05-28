import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runYamlBatchInRstest,
  runYamlBatchInRstestFromManifest,
} from '@/framework/yaml-batch';
import { runYamlBatch } from '@/yaml-batch-executor';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runYamlBatch: vi.fn(),
}));

vi.mock('@/yaml-batch-executor', () => ({
  runYamlBatch: mocks.runYamlBatch,
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
    vi.clearAllMocks();
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
    mocks.runYamlBatch.mockResolvedValue(results);

    try {
      await expect(
        runYamlBatchInRstest({
          config,
          resultFiles: {
            [yamlA]: resultA,
            [yamlB]: resultB,
          },
        }),
      ).resolves.toEqual(results);

      expect(runYamlBatch).toHaveBeenCalledWith(config, {
        generateSummary: false,
        printExecutionPlan: false,
      });
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
    mocks.runYamlBatch.mockResolvedValue([
      {
        file: yamlA,
        success: false,
        executed: true,
        duration: 10,
        resultType: 'failed',
        error: 'browser crashed',
      },
      {
        file: yamlB,
        success: false,
        executed: true,
        duration: 20,
        resultType: 'partialFailed',
      },
    ] satisfies MidsceneYamlConfigResult[]);

    try {
      await expect(
        runYamlBatchInRstest({
          config,
          resultFiles: {
            [yamlA]: resultA,
            [yamlB]: resultB,
          },
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

  test('loads batch options from a generated manifest file', async () => {
    const root = createTempDir();
    const yaml = join(root, 'manifest.yaml');
    const resultFile = join(root, 'results', 'manifest.json');
    const manifestFile = join(root, 'batch-manifest.json');
    const config = createConfig([yaml]);
    const results: MidsceneYamlConfigResult[] = [
      {
        file: yaml,
        success: true,
        executed: true,
        duration: 10,
        resultType: 'success',
      },
    ];
    mocks.runYamlBatch.mockResolvedValue(results);
    writeFileSync(
      manifestFile,
      JSON.stringify({
        config,
        resultFiles: {
          [yaml]: resultFile,
        },
      }),
    );

    try {
      await expect(
        runYamlBatchInRstestFromManifest(manifestFile),
      ).resolves.toEqual(results);

      expect(runYamlBatch).toHaveBeenCalledWith(config, {
        generateSummary: false,
        printExecutionPlan: false,
      });
      expect(JSON.parse(readFileSync(resultFile, 'utf8'))).toMatchObject({
        file: yaml,
        success: true,
        resultType: 'success',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
