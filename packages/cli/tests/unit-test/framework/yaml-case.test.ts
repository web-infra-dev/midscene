import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createYamlPlayer } from '@/create-yaml-player';
import { runYamlCase, runYamlCaseResult } from '@/framework/yaml-case';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/create-yaml-player', () => ({
  createYamlPlayer: vi.fn(),
}));

const createPlayer = (overrides: Record<string, any> = {}) => ({
  status: 'done',
  output: '/tmp/output.json',
  reportFile: '/tmp/report.html',
  errorInSetup: undefined,
  taskStatusList: [],
  run: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createTempDir = () => mkdtempSync(join(tmpdir(), 'midscene-yaml-case-'));

describe('runYamlCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('runs a YAML player and returns output metadata', async () => {
    const root = createTempDir();
    const output = join(root, 'output.json');
    writeFileSync(output, '{}');
    const player = createPlayer({ output });
    vi.mocked(createYamlPlayer).mockResolvedValue(player as any);

    try {
      const result = await runYamlCase({ file: 'relative.yaml', headed: true });

      expect(createYamlPlayer).toHaveBeenCalledWith(
        expect.stringMatching(/relative\.yaml$/),
        undefined,
        { headed: true, keepWindow: undefined },
      );
      expect(player.run).toHaveBeenCalledTimes(1);
      expect(result.output).toBe(output);
      expect(result.report).toBe('/tmp/report.html');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('passes merged execution config to the YAML player', async () => {
    const player = createPlayer();
    const executionConfig = {
      web: {
        url: 'https://example.com',
        viewportWidth: 1280,
      },
      tasks: [],
    };
    vi.mocked(createYamlPlayer).mockResolvedValue(player as any);

    await runYamlCase({ file: 'relative.yaml', executionConfig });

    expect(createYamlPlayer).toHaveBeenCalledWith(
      expect.stringMatching(/relative\.yaml$/),
      executionConfig,
      { headed: undefined, keepWindow: undefined },
    );
  });

  test('merges global config inside the YAML case process', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const player = createPlayer();
    vi.mocked(createYamlPlayer).mockResolvedValue(player as any);
    writeFileSync(yaml, 'web:\n  url: https://file.example\ntasks: []\n');

    try {
      await runYamlCase({
        file: yaml,
        globalConfig: {
          web: {
            viewportWidth: 1280,
          },
        },
      });

      expect(createYamlPlayer).toHaveBeenCalledWith(
        yaml,
        expect.objectContaining({
          web: {
            url: 'https://file.example',
            viewportWidth: 1280,
          },
          tasks: [],
        }),
        { headed: undefined, keepWindow: undefined },
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('throws setup errors from the YAML player', async () => {
    const error = new Error('setup failed');
    const player = createPlayer({
      status: 'error',
      errorInSetup: error,
    });
    vi.mocked(createYamlPlayer).mockResolvedValue(player as any);

    await expect(runYamlCase({ file: 'broken.yaml' })).rejects.toThrow(
      'setup failed',
    );
  });

  test('throws task failures with report and output paths', async () => {
    const root = createTempDir();
    const output = join(root, 'output.json');
    writeFileSync(output, '{}');
    const player = createPlayer({
      status: 'error',
      output,
      taskStatusList: [
        {
          name: 'check result',
          status: 'error',
          error: new Error('assertion failed'),
        },
      ],
    });
    vi.mocked(createYamlPlayer).mockResolvedValue(player as any);

    try {
      await expect(runYamlCase({ file: 'failed.yaml' })).rejects.toThrow(
        new RegExp(
          `assertion failed[\\s\\S]*Report: /tmp/report\\.html[\\s\\S]*Output: ${output.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&',
          )}`,
        ),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('returns partialFailed when tasks fail with continueOnError', async () => {
    const root = createTempDir();
    const output = join(root, 'output.json');
    writeFileSync(output, '{}');
    const player = createPlayer({
      status: 'done',
      output,
      taskStatusList: [
        {
          name: 'soft assertion',
          status: 'error',
          error: new Error('soft assertion failed'),
        },
      ],
    });
    vi.mocked(createYamlPlayer).mockResolvedValue(player as any);

    try {
      const result = await runYamlCaseResult({ file: 'partial.yaml' });
      expect(result).toMatchObject({
        success: false,
        executed: true,
        output,
        report: '/tmp/report.html',
        resultType: 'partialFailed',
        error: 'soft assertion failed',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
