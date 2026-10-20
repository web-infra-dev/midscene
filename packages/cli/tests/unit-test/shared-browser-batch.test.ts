import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BatchRunner } from '@/batch-runner';
import { createYamlPlayer } from '@/create-yaml-player';
import type {
  MidsceneYamlScript,
  MidsceneYamlScriptEnv,
  ScriptPlayerStatusValue,
} from '@midscene/core';
import * as yamlActual from '@midscene/core/yaml' with {
  rstest: 'importActual',
};
import { type ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import * as launcherActual from '@midscene/web/puppeteer-agent-launcher' with {
  rstest: 'importActual',
};
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import puppeteer, { type Browser } from 'puppeteer';

rs.mock('node:fs');
rs.mock('puppeteer', () => ({
  default: {
    launch: rs.fn(),
    connect: rs.fn(),
  },
}));
rs.mock('@/create-yaml-player');
rs.mock('@midscene/shared/common', () => ({
  getMidsceneRunSubDir: () => '/test/output',
}));
rs.mock('@midscene/shared/logger', () => ({
  getDebug: () => rs.fn(),
}));
rs.mock('@midscene/core/yaml', () => ({
  ...yamlActual,
  parseYamlScript: rs.fn(),
}));
rs.mock('@/printer', () => ({
  isTTY: false,
  contextInfo: () => ({ mergedText: 'test info' }),
  contextTaskListSummary: () => 'test summary',
  pendingContextTaskListSummary: () => 'pending summary',
  spinnerInterval: 80,
}));
rs.mock('@/tty-renderer');
rs.mock('@midscene/web/puppeteer-agent-launcher', () => ({
  ...launcherActual,
  buildDownloadBehavior: (downloadPath: string | undefined) =>
    downloadPath
      ? {
          policy: 'allow',
          downloadPath: path.resolve(downloadPath),
        }
      : undefined,
}));

const webScript: MidsceneYamlScript = {
  tasks: [{ name: 'test task', flow: [{ aiAction: 'test' }] }],
  web: { url: 'http://test.com' },
};

const baseConfig = {
  files: ['web1.yml', 'web2.yml'],
  concurrent: 2,
  continueOnError: false,
  summary: 'test-summary.json',
  shareBrowserContext: true,
  globalConfig: { web: { url: 'http://example.com' } },
  headed: false,
  keepWindow: false,
  dotenvDebug: true,
  dotenvOverride: false,
};

const createMockBrowserContext = () => ({
  close: rs.fn().mockResolvedValue(undefined),
  newPage: rs.fn(),
});

const createMockBrowser = () => ({
  close: rs.fn().mockResolvedValue(undefined),
  disconnect: rs.fn(),
  createBrowserContext: rs
    .fn()
    .mockImplementation(async () => createMockBrowserContext()),
});

const createMockPlayer = (
  success = true,
): ScriptPlayer<MidsceneYamlScriptEnv> => {
  const player = {
    status: 'init' as ScriptPlayerStatusValue,
    output: '/test/output/file.json',
    reportFile: '/test/report.html',
    errorInSetup: success ? null : new Error('Mock error'),
    taskStatusList: [],
    currentTaskIndex: undefined,
    agentStatusTip: '',
    run: rs.fn(async () => {
      player.status = success ? 'done' : 'error';
    }),
  };
  return player as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
};

describe('shared-browser YAML batch orchestration', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(readFileSync).mockReturnValue('mock yaml content');
    rs.mocked(existsSync).mockReturnValue(true);
    rs.mocked(parseYamlScript).mockReturnValue(webScript);
    rs.mocked(puppeteer.launch).mockResolvedValue(
      createMockBrowser() as unknown as Browser,
    );
    rs.mocked(puppeteer.connect).mockResolvedValue(
      createMockBrowser() as unknown as Browser,
    );
    rs.mocked(createYamlPlayer).mockImplementation(async () =>
      createMockPlayer(),
    );
  });

  test('shares one BrowserContext while leaving Page creation to the web launcher', async () => {
    await new BatchRunner(baseConfig).run();

    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    const browser = await rs.mocked(puppeteer.launch).mock.results[0].value;
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(1);
    const browserContext =
      await browser.createBrowserContext.mock.results[0].value;
    for (const [file, , options] of rs.mocked(createYamlPlayer).mock.calls) {
      expect(['web1.yml', 'web2.yml']).toContain(file);
      expect(options).toMatchObject({ browser, browserContext });
      expect(options).not.toHaveProperty('page');
      expect(options).not.toHaveProperty('pageOwnership');
    }
    expect(browserContext.newPage).not.toHaveBeenCalled();
    expect(browserContext.close).toHaveBeenCalledTimes(1);
  });

  test('passes shared-browser Chrome launch options', async () => {
    await new BatchRunner({
      ...baseConfig,
      files: ['web.yml'],
      globalConfig: {
        web: {
          url: 'http://example.com',
          chromeArgs: ['--disable-dev-shm-usage'],
          acceptInsecureCerts: true,
          downloadPath: './downloads',
        },
      },
    }).run();

    expect(puppeteer.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptInsecureCerts: true,
        args: expect.arrayContaining(['--disable-dev-shm-usage']),
        downloadBehavior: {
          policy: 'allow',
          downloadPath: path.resolve('./downloads'),
        },
      }),
    );
  });

  test('does not launch a shared Browser when sharing is disabled', async () => {
    await new BatchRunner({
      ...baseConfig,
      shareBrowserContext: false,
    }).run();

    expect(puppeteer.launch).not.toHaveBeenCalled();
    for (const [, , options] of rs.mocked(createYamlPlayer).mock.calls) {
      expect(options).not.toHaveProperty('browser');
    }
  });

  test('does not launch Puppeteer for a non-web batch', async () => {
    rs.mocked(parseYamlScript).mockReturnValue({
      tasks: [],
      android: { deviceId: 'test' },
    });

    await new BatchRunner({
      ...baseConfig,
      files: ['android.yml'],
      globalConfig: {},
      shareBrowserContext: false,
    }).run();

    expect(puppeteer.launch).not.toHaveBeenCalled();
  });

  test('connects and disconnects instead of closing in shared CDP mode', async () => {
    const browser = createMockBrowser();
    rs.mocked(puppeteer.connect).mockResolvedValue(
      browser as unknown as Browser,
    );

    await new BatchRunner({
      ...baseConfig,
      files: ['web.yml'],
      globalConfig: {
        web: {
          url: 'http://example.com',
          cdpEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
          downloadPath: './downloads',
        },
      },
    }).run();

    expect(puppeteer.connect).toHaveBeenCalledWith({
      browserWSEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
      defaultViewport: null,
      downloadBehavior: {
        policy: 'allow',
        downloadPath: path.resolve('./downloads'),
      },
    });
    expect(puppeteer.launch).not.toHaveBeenCalled();
    expect(browser.disconnect).toHaveBeenCalledTimes(1);
    expect(browser.close).not.toHaveBeenCalled();
  });

  describe('setup', () => {
    const setupConfig = {
      ...baseConfig,
      setup: 'login.yml',
      files: ['search.yml', 'report.yml'],
    };

    test('runs setup before the main files', async () => {
      const runOrder: string[] = [];
      rs.mocked(createYamlPlayer).mockImplementation(async (file) => {
        const player = createMockPlayer();
        player.run = rs.fn(async () => {
          runOrder.push(file);
          player.status = 'done';
        });
        return player;
      });

      const runner = new BatchRunner(setupConfig);
      await runner.run();

      expect(runOrder[0]).toBe('login.yml');
      expect(new Set(runOrder.slice(1))).toEqual(
        new Set(['search.yml', 'report.yml']),
      );
      expect(runner.getSuccessfulFiles()).toHaveLength(3);
    });

    test('aborts main files when setup fails', async () => {
      rs.mocked(createYamlPlayer).mockImplementation(async (file) =>
        createMockPlayer(file !== 'login.yml'),
      );

      const runner = new BatchRunner(setupConfig);
      await runner.run();

      expect(createYamlPlayer).toHaveBeenCalledTimes(1);
      expect(runner.getFailedFiles()).toEqual(['login.yml']);
      expect(new Set(runner.getNotExecutedFiles())).toEqual(
        new Set(['search.yml', 'report.yml']),
      );
    });

    test('aborts main files when setup is partially successful', async () => {
      rs.mocked(createYamlPlayer).mockImplementation(async (file) => {
        const player = createMockPlayer();
        player.run = rs.fn(async () => {
          player.status = 'done';
          if (file === 'login.yml') {
            player.taskStatusList = [
              {
                name: 'Login prerequisite',
                flow: [{ javascript: 'false' }],
                status: 'error',
                totalSteps: 1,
                currentStep: 0,
                error: new Error('Login failed'),
              },
            ];
          }
        });
        return player;
      });

      const runner = new BatchRunner(setupConfig);
      await runner.run();

      expect(createYamlPlayer).toHaveBeenCalledTimes(1);
      expect(runner.getPartialFailedFiles()).toEqual(['login.yml']);
      expect(runner.getNotExecutedFiles()).toHaveLength(2);
    });

    test('exposes unexpected setup failures through the typed batch error', async () => {
      const executionError = new Error('setup execution exploded');
      rs.mocked(createYamlPlayer).mockImplementation(async () => {
        const player = createMockPlayer();
        player.run = rs.fn().mockRejectedValue(executionError);
        return player;
      });

      const runner = new BatchRunner(setupConfig);
      await expect(runner.run()).rejects.toMatchObject({
        cause: executionError,
        results: [
          expect.objectContaining({
            file: 'login.yml',
            resultType: 'failed',
          }),
          expect.objectContaining({ resultType: 'notExecuted' }),
          expect.objectContaining({ resultType: 'notExecuted' }),
        ],
      });
    });

    test('rejects setup without a shared Browser context', async () => {
      await expect(
        new BatchRunner({
          ...setupConfig,
          shareBrowserContext: false,
        }).run(),
      ).rejects.toThrow('requires shareBrowserContext: true');
    });

    test('rejects a file used as both setup and a main file', async () => {
      await expect(
        new BatchRunner({
          ...setupConfig,
          files: ['login.yml', 'search.yml'],
        }).run(),
      ).rejects.toThrow('is used as both the setup file and a main file');
    });
  });
});
