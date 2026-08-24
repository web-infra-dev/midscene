import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createYamlPlayer } from '@/create-yaml-player';
import {
  runYamlCase,
  runYamlCaseResult,
  runYamlCaseResultWithSnapshots,
} from '@/framework/yaml-case';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';

rs.mock('@/create-yaml-player', () => ({
  createYamlPlayer: rs.fn(),
}));

const createPlayer = (overrides: Record<string, any> = {}) => ({
  status: 'done',
  output: '/tmp/output.json',
  reportFile: '/tmp/report.html',
  errorInSetup: undefined,
  taskStatusList: [],
  run: rs.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createTempDir = () => mkdtempSync(join(tmpdir(), 'midscene-yaml-case-'));

describe('runYamlCase', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('runs a YAML player and returns output metadata', async () => {
    const root = createTempDir();
    const output = join(root, 'output.json');
    writeFileSync(output, '{}');
    const player = createPlayer({ output });
    rs.mocked(createYamlPlayer).mockResolvedValue(player as any);

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

  test('reports task names before and after the YAML player runs', async () => {
    const player = createPlayer({
      status: 'init',
      taskStatusList: [{ name: 'login', status: 'init' }],
    });
    player.run.mockImplementation(async () => {
      player.status = 'done';
      player.taskStatusList[0].status = 'done';
    });
    rs.mocked(createYamlPlayer).mockResolvedValue(player as any);
    const snapshots: Array<{ player: string; task: string }> = [];
    const onPlayerSnapshot = rs.fn(
      ({ player: currentPlayer }: { player: typeof player }) => {
        snapshots.push({
          player: currentPlayer.status,
          task: currentPlayer.taskStatusList[0].status,
        });
      },
    );

    await runYamlCaseResultWithSnapshots(
      { file: 'relative.yaml' },
      onPlayerSnapshot,
    );

    expect(onPlayerSnapshot).toHaveBeenCalledTimes(2);
    expect(onPlayerSnapshot.mock.calls[0][0]).toMatchObject({
      file: expect.stringMatching(/relative\.yaml$/),
    });
    expect(onPlayerSnapshot.mock.calls[0][0].player).toBe(player);
    expect(snapshots).toEqual([
      { player: 'init', task: 'init' },
      { player: 'done', task: 'done' },
    ]);
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
    rs.mocked(createYamlPlayer).mockResolvedValue(player as any);

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
    rs.mocked(createYamlPlayer).mockResolvedValue(player as any);
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

  test('normalizes target config and merges global platform config', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const player = createPlayer();
    rs.mocked(createYamlPlayer).mockResolvedValue(player as any);
    writeFileSync(
      yaml,
      [
        'target:',
        '  url: https://file-target.example',
        '  userAgent: file-agent',
        'android:',
        '  launch: file.app',
        'tasks: []',
        '',
      ].join('\n'),
    );

    try {
      await runYamlCase({
        file: yaml,
        globalConfig: {
          target: {
            url: 'https://global-target.example',
            viewportWidth: 1440,
          },
          web: {
            viewportHeight: 900,
          },
          android: {
            deviceId: 'global-device',
          },
          ios: {
            wdaHost: 'ios-wda-host',
          },
        },
      });

      expect(createYamlPlayer).toHaveBeenCalledWith(
        yaml,
        {
          web: {
            url: 'https://global-target.example',
            userAgent: 'file-agent',
            viewportWidth: 1440,
            viewportHeight: 900,
          },
          android: {
            launch: 'file.app',
            deviceId: 'global-device',
          },
          ios: {
            wdaHost: 'ios-wda-host',
          },
          tasks: [],
        },
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
    rs.mocked(createYamlPlayer).mockResolvedValue(player as any);

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
    rs.mocked(createYamlPlayer).mockResolvedValue(player as any);

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
    rs.mocked(createYamlPlayer).mockResolvedValue(player as any);

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
