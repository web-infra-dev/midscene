import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createYamlPlayer } from '@/create-yaml-player';
import { runYamlCase, runYamlCaseResult } from '@/framework/yaml-case';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/create-yaml-player', () => ({
  createYamlPlayer: vi.fn(),
}));

type YamlPlayer = Awaited<ReturnType<typeof createYamlPlayer>>;

const createPlayer = (overrides: Partial<YamlPlayer> = {}): YamlPlayer =>
  ({
    status: 'done',
    output: '/tmp/output.json',
    reportFile: '/tmp/report.html',
    errorInSetup: undefined,
    taskStatusList: [],
    run: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as YamlPlayer;

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
    vi.mocked(createYamlPlayer).mockResolvedValue(player);

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
    vi.mocked(createYamlPlayer).mockResolvedValue(player);

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
    vi.mocked(createYamlPlayer).mockResolvedValue(player);
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

  test('merges global config into a provided execution config', async () => {
    const player = createPlayer();
    vi.mocked(createYamlPlayer).mockResolvedValue(player);

    await runYamlCase({
      file: 'checkout.feature',
      executionConfig: {
        tasks: [
          {
            name: 'Add item',
            flow: [{ aiAct: 'I add an item' }],
          },
        ],
      },
      globalConfig: {
        web: {
          url: 'https://shop.example',
          viewportWidth: 1280,
        },
      },
    });

    expect(createYamlPlayer).toHaveBeenCalledWith(
      expect.stringMatching(/checkout\.feature$/),
      {
        tasks: [
          {
            name: 'Add item',
            flow: [{ aiAct: 'I add an item' }],
          },
        ],
        web: {
          url: 'https://shop.example',
          viewportWidth: 1280,
        },
      },
      { headed: undefined, keepWindow: undefined },
    );
  });

  test('normalizes target config and merges global platform config', async () => {
    const root = createTempDir();
    const yaml = join(root, 'case.yaml');
    const player = createPlayer();
    vi.mocked(createYamlPlayer).mockResolvedValue(player);
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
            deviceId: 'ios-device',
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
            deviceId: 'ios-device',
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
    vi.mocked(createYamlPlayer).mockResolvedValue(player);

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
          flow: [],
          totalSteps: 1,
          status: 'error',
          error: new Error('assertion failed'),
        },
      ],
    });
    vi.mocked(createYamlPlayer).mockResolvedValue(player);

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
          flow: [],
          totalSteps: 1,
          status: 'error',
          error: new Error('soft assertion failed'),
        },
      ],
    });
    vi.mocked(createYamlPlayer).mockResolvedValue(player);

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
