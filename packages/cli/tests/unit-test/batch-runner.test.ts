import {
  type Stats,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { BatchRunner } from '@/batch-runner';
import { createYamlPlayer } from '@/create-yaml-player';
import type {
  MidsceneYamlScript,
  MidsceneYamlScriptEnv,
  ScriptPlayerStatusValue,
} from '@midscene/core';
import { type ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import puppeteer, { type Browser } from 'puppeteer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock all dependencies
vi.mock('node:fs');
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn(),
    connect: vi.fn(),
  },
}));
vi.mock('@/create-yaml-player');
vi.mock('@midscene/shared/common');
vi.mock('@midscene/shared/logger', () => ({
  getDebug: () => vi.fn(),
}));
vi.mock('@midscene/core/yaml', async (importOriginal) => {
  const original = await importOriginal<typeof import('@midscene/core/yaml')>();
  return {
    ...original,
    parseYamlScript: vi.fn(),
  };
});
vi.mock('@/printer', () => ({
  isTTY: false,
  contextInfo: vi.fn().mockReturnValue({ mergedText: 'test info' }),
  contextTaskListSummary: vi.fn().mockReturnValue('test summary'),
  pendingContextTaskListSummary: vi.fn().mockReturnValue('pending summary'),
  spinnerInterval: 80,
}));
vi.mock('@/tty-renderer');
vi.mock('@midscene/web/puppeteer-agent-launcher', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('@midscene/web/puppeteer-agent-launcher')
    >();
  return {
    ...original,
    buildDownloadBehavior: (downloadPath: string | undefined) =>
      downloadPath
        ? {
            policy: 'allow',
            downloadPath: downloadPath.startsWith('/')
              ? downloadPath
              : `${process.cwd()}/${downloadPath.replace(/^\.\//, '')}`,
          }
        : undefined,
  };
});
vi.mock('@midscene/web/bridge-mode');
vi.mock('@midscene/android');

const mockBatchConfig = {
  files: ['file1.yml', 'file2.yml', 'file3.yml'],
  concurrent: 2,
  continueOnError: false,
  summary: 'test-summary.json',
  shareBrowserContext: false,
  globalConfig: {
    web: { url: 'http://example.com' },
  },
  headed: false,
  keepWindow: false,
  dotenvDebug: true,
  dotenvOverride: false,
};

// Mock the yaml script
const mockYamlScript = {
  tasks: [{ name: 'test task', flow: [{ aiAction: 'test' }] }],
  web: { url: 'http://test.com' },
};

interface MockPage {
  browser: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  isClosed: ReturnType<typeof vi.fn>;
}

const createMockBrowser = () => {
  const pages: MockPage[] = [];
  const browser = {
    close: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    pages: vi.fn(async () => [...pages]),
    newPage: vi.fn(),
  };
  browser.newPage.mockImplementation(async () => {
    let closed = false;
    const page = {
      browser: vi.fn(() => browser),
      close: vi.fn(async () => {
        closed = true;
      }),
      isClosed: vi.fn(() => closed),
    };
    pages.push(page);
    return page;
  });
  return browser;
};

// Mock ScriptPlayer
const createMockPlayer = (
  success = true,
): ScriptPlayer<MidsceneYamlScriptEnv> => {
  const mockPlayer = {
    status: 'init' as ScriptPlayerStatusValue,
    output: '/test/output/file.json',
    reportFile: '/test/report.html',
    result: { test: 'data' },
    errorInSetup: success ? null : new Error('Mock error'),
    taskStatusList: [],
    run: vi.fn().mockImplementation(async () => {
      mockPlayer.status = success ? 'done' : 'error';
      return undefined;
    }),
    script: mockYamlScript,
    setupAgent: vi.fn(),
    unnamedResultIndex: 0,
    pageAgent: null,
    currentTaskIndex: undefined,
    agentStatusTip: '',
  };
  return mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
};

describe('BatchRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(puppeteer.launch).mockResolvedValue(
      createMockBrowser() as unknown as Browser,
    );
    vi.mocked(puppeteer.connect).mockResolvedValue(
      createMockBrowser() as unknown as Browser,
    );

    vi.mocked(readFileSync).mockReturnValue('mock yaml content');
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    vi.mocked(writeFileSync).mockImplementation(() => undefined);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as Stats);
    vi.mocked(existsSync).mockReturnValue(true);

    vi.mocked(parseYamlScript).mockReturnValue(
      mockYamlScript as MidsceneYamlScript,
    );

    vi.mocked(createYamlPlayer).mockImplementation(async () =>
      createMockPlayer(),
    );

    vi.mocked(getMidsceneRunSubDir).mockReturnValue('/test/output');
  });

  describe('shareBrowserContext logic', () => {
    test('should create one browser instance when shareBrowserContext is true', async () => {
      const config = {
        ...mockBatchConfig,
        shareBrowserContext: true,
        files: ['web1.yml', 'web2.yml'],
      };
      const runner = new BatchRunner(config);
      await runner.run();

      expect(puppeteer.launch).toHaveBeenCalledTimes(1);

      const browserInstance = (await vi.mocked(puppeteer.launch).mock.results[0]
        .value) as any;
      expect(vi.mocked(createYamlPlayer)).toHaveBeenCalledWith(
        'web1.yml',
        expect.any(Object),
        expect.objectContaining({ browser: browserInstance }),
      );
      expect(vi.mocked(createYamlPlayer)).toHaveBeenCalledWith(
        'web2.yml',
        expect.any(Object),
        expect.objectContaining({ browser: browserInstance }),
      );

      const pageByFile = new Map(
        vi
          .mocked(createYamlPlayer)
          .mock.calls.map(([file, , options]) => [file, options?.page]),
      );
      expect(pageByFile.get('web1.yml')).toBeDefined();
      expect(pageByFile.get('web2.yml')).toBeDefined();
      expect(pageByFile.get('web1.yml')).not.toBe(pageByFile.get('web2.yml'));
    });

    test('should pass chromeArgs from global config to puppeteer.launch when shareBrowserContext is true', async () => {
      const config = {
        ...mockBatchConfig,
        shareBrowserContext: true,
        files: ['web1.yml', 'web2.yml'],
        globalConfig: {
          web: {
            url: 'http://example.com',
            chromeArgs: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
            ],
          },
        },
      };
      const runner = new BatchRunner(config);
      await runner.run();

      expect(puppeteer.launch).toHaveBeenCalledTimes(1);

      // Verify that puppeteer.launch was called with the correct arguments
      const launchCall = vi.mocked(puppeteer.launch).mock.calls[0][0];
      expect(launchCall).toHaveProperty('args');
      expect(launchCall?.args).toEqual(
        expect.arrayContaining([
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ]),
      );
    });

    test('should pass acceptInsecureCerts from global config to puppeteer.launch when shareBrowserContext is true', async () => {
      const config = {
        ...mockBatchConfig,
        shareBrowserContext: true,
        files: ['web1.yml'],
        globalConfig: {
          web: {
            url: 'http://example.com',
            acceptInsecureCerts: true,
          },
        },
      };
      const runner = new BatchRunner(config);
      await runner.run();

      expect(puppeteer.launch).toHaveBeenCalledTimes(1);

      const launchCall = vi.mocked(puppeteer.launch).mock.calls[0][0];
      expect(launchCall).toHaveProperty('acceptInsecureCerts', true);
    });

    test('should pass downloadPath to Puppeteer launch options when shareBrowserContext is true', async () => {
      const config = {
        ...mockBatchConfig,
        shareBrowserContext: true,
        files: ['web1.yml'],
        globalConfig: {
          web: {
            url: 'http://example.com',
            downloadPath: './downloads',
          },
        },
      };
      const runner = new BatchRunner(config);
      await runner.run();

      expect(puppeteer.launch).toHaveBeenCalledTimes(1);

      const launchCall = vi.mocked(puppeteer.launch).mock.calls[0][0];
      expect(launchCall).toHaveProperty('downloadBehavior', {
        policy: 'allow',
        downloadPath: path.resolve('./downloads'),
      });
    });

    test('should not create a shared browser instance when shareBrowserContext is false', async () => {
      const config = {
        ...mockBatchConfig,
        shareBrowserContext: false,
        files: ['web1.yml', 'web2.yml'],
      };
      const runner = new BatchRunner(config);
      await runner.run();

      expect(puppeteer.launch).not.toHaveBeenCalled();

      expect(vi.mocked(createYamlPlayer)).toHaveBeenCalledWith(
        'web1.yml',
        expect.any(Object),
        expect.not.objectContaining({ browser: expect.anything() }),
      );
      expect(vi.mocked(createYamlPlayer)).toHaveBeenCalledWith(
        'web2.yml',
        expect.any(Object),
        expect.not.objectContaining({ browser: expect.anything() }),
      );
    });

    test('should not create any browser instance if no web tasks', async () => {
      const config = {
        ...mockBatchConfig,
        shareBrowserContext: true, // even if true
        files: ['android1.yml', 'android2.yml'],
        globalConfig: {},
      };
      // mock file config to be android only
      vi.mocked(parseYamlScript).mockReturnValue({
        tasks: [],
        android: { deviceId: 'test' },
      });

      const runner = new BatchRunner(config);
      await runner.run();

      expect(puppeteer.launch).not.toHaveBeenCalled();
    });

    test('should use puppeteer.connect when cdpEndpoint is specified in global config', async () => {
      const config = {
        ...mockBatchConfig,
        shareBrowserContext: true,
        files: ['web1.yml'],
        globalConfig: {
          web: {
            url: 'http://example.com',
            cdpEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
          },
        },
      };
      const runner = new BatchRunner(config);
      await runner.run();

      expect(puppeteer.connect).toHaveBeenCalledWith({
        browserWSEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
        defaultViewport: null,
        downloadBehavior: undefined,
      });
      // Should NOT call launch
      expect(puppeteer.launch).not.toHaveBeenCalled();
    });

    test('should pass downloadPath to Puppeteer connect options when shareBrowserContext uses CDP', async () => {
      const config = {
        ...mockBatchConfig,
        shareBrowserContext: true,
        files: ['web1.yml'],
        globalConfig: {
          web: {
            url: 'http://example.com',
            cdpEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
            downloadPath: './downloads',
          },
        },
      };
      const runner = new BatchRunner(config);
      await runner.run();

      expect(puppeteer.connect).toHaveBeenCalledWith({
        browserWSEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
        defaultViewport: null,
        downloadBehavior: {
          policy: 'allow',
          downloadPath: path.resolve('./downloads'),
        },
      });
    });

    test('should disconnect (not close) browser in CDP mode', async () => {
      const mockDisconnect = vi.fn();
      const mockClose = vi.fn().mockResolvedValue(undefined);
      const cdpBrowser = createMockBrowser();
      cdpBrowser.disconnect = mockDisconnect;
      cdpBrowser.close = mockClose;
      vi.mocked(puppeteer.connect).mockResolvedValue(
        cdpBrowser as unknown as Browser,
      );

      const config = {
        ...mockBatchConfig,
        shareBrowserContext: true,
        keepWindow: false,
        files: ['web1.yml'],
        globalConfig: {
          web: {
            url: 'http://example.com',
            cdpEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
          },
        },
      };
      const runner = new BatchRunner(config);
      await runner.run();

      // In CDP mode, should disconnect, not close
      expect(mockDisconnect).toHaveBeenCalled();
      expect(mockClose).not.toHaveBeenCalled();
    });
  });

  describe('BatchRunner execution', () => {
    test('constructor creates executor with config', () => {
      const executor = new BatchRunner(mockBatchConfig);
      expect(executor).toBeDefined();
    });

    test('run executes files successfully with default options', async () => {
      vi.mocked(createYamlPlayer).mockImplementation(async () =>
        createMockPlayer(true),
      );
      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    test('run executes files successfully with options', async () => {
      vi.mocked(createYamlPlayer).mockImplementation(async () =>
        createMockPlayer(true),
      );
      const executor = new BatchRunner(mockBatchConfig);
      // @ts-ignore Preserve this historical options-call fixture while the runtime API now reads options from BatchRunnerConfig.
      const results = await executor.run({ keepWindow: true, headed: true });
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('BatchRunner concurrent execution', () => {
    test('run stops on first failure when continueOnError=false', async () => {
      const config = { ...mockBatchConfig, continueOnError: false };
      let callCount = 0;
      vi.mocked(createYamlPlayer).mockImplementation(async () => {
        const shouldFail = callCount === 0;
        callCount++;
        return createMockPlayer(!shouldFail);
      });

      const executor = new BatchRunner(config);
      const results = await executor.run();

      expect(results).toHaveLength(3);

      const file1Result = results.find((r) => r.file === 'file1.yml');
      const file2Result = results.find((r) => r.file === 'file2.yml');
      const file3Result = results.find((r) => r.file === 'file3.yml');

      expect(file1Result?.success).toBe(false);
      expect(file1Result?.executed).toBe(true);
      expect(file1Result?.error).toBe('Mock error');

      expect(file2Result?.success).toBe(true);
      expect(file2Result?.executed).toBe(true);

      expect(file3Result?.success).toBe(false);
      expect(file3Result?.executed).toBe(false);
      expect(file3Result?.error).toBe('Not executed (previous task failed)');
    });

    test('run continues on failure when continueOnError=true', async () => {
      const config = { ...mockBatchConfig, continueOnError: true };
      let callCount = 0;
      vi.mocked(createYamlPlayer).mockImplementation(async () => {
        const shouldFail = callCount === 0;
        callCount++;
        return createMockPlayer(!shouldFail);
      });

      const executor = new BatchRunner(config);
      const results = await executor.run();

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(false);
      expect(results[0].executed).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[1].executed).toBe(true);
      expect(results[2].success).toBe(true);
      expect(results[2].executed).toBe(true);
    });

    test('stops serial execution when a YAML is only partially successful', async () => {
      vi.mocked(createYamlPlayer).mockImplementation(async (file) => {
        const player = createMockPlayer(true);
        player.run = vi.fn(async () => {
          player.status = 'done';
          if (file === 'file1.yml') {
            player.taskStatusList = [
              {
                name: 'Continue after task failure',
                flow: [{ javascript: 'false' }],
                continueOnError: true,
                status: 'error',
                totalSteps: 1,
                currentStep: 0,
                error: new Error('task failed'),
              },
            ];
          }
        });
        return player;
      });

      const runner = new BatchRunner({
        ...mockBatchConfig,
        concurrent: 1,
        continueOnError: false,
      });
      const results = await runner.run();

      expect(
        vi.mocked(createYamlPlayer).mock.calls.map(([file]) => file),
      ).toEqual(['file1.yml']);
      expect(
        results.find((result) => result.file === 'file1.yml'),
      ).toMatchObject({
        resultType: 'partialFailed',
        executed: true,
      });
      expect(
        results
          .filter((result) => result.file !== 'file1.yml')
          .every((result) => result.resultType === 'notExecuted'),
      ).toBe(true);
    });

    test('records all outcomes before surfacing an unexpected error when continueOnError is true', async () => {
      const executionError = new Error('execution exploded');
      vi.mocked(createYamlPlayer).mockImplementation(async (file) => {
        const player = createMockPlayer(true);
        if (file === 'file1.yml') {
          player.run = vi.fn().mockRejectedValue(executionError);
        }
        return player;
      });

      const runner = new BatchRunner({
        ...mockBatchConfig,
        continueOnError: true,
      });

      await expect(runner.run()).rejects.toBe(executionError);
      expect(runner.getResults()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: 'file1.yml',
            executed: true,
            resultType: 'failed',
            error: executionError.message,
          }),
          expect.objectContaining({
            file: 'file2.yml',
            resultType: 'success',
          }),
          expect.objectContaining({
            file: 'file3.yml',
            resultType: 'success',
          }),
        ]),
      );
    });

    test('does not start queued YAML files after a partial failure', async () => {
      let firstPlayer: ScriptPlayer<MidsceneYamlScriptEnv> | undefined;
      let releaseSecondFile: (() => void) | undefined;
      const secondFileStarted = new Promise<void>((resolve) => {
        releaseSecondFile = resolve;
      });

      vi.mocked(createYamlPlayer).mockImplementation(async (file) => {
        const player = createMockPlayer(true);
        if (file === 'file1.yml') {
          firstPlayer = player;
        }
        player.run = vi.fn(async () => {
          player.status = 'done';
          if (file === 'file1.yml') {
            await secondFileStarted;
            player.taskStatusList = [
              {
                name: 'Partial failure',
                flow: [{ javascript: 'false' }],
                continueOnError: true,
                status: 'error',
                totalSteps: 1,
                currentStep: 0,
                error: new Error('task failed'),
              },
            ];
          } else if (file === 'file2.yml') {
            releaseSecondFile?.();
            while (
              !firstPlayer?.taskStatusList.some(
                (task) => task.status === 'error',
              )
            ) {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        });
        return player;
      });

      const runner = new BatchRunner({
        ...mockBatchConfig,
        concurrent: 2,
        continueOnError: false,
      });
      const results = await runner.run();

      expect(
        vi
          .mocked(createYamlPlayer)
          .mock.calls.map(([file]) => file)
          .sort(),
      ).toEqual(['file1.yml', 'file2.yml']);
      expect(
        results.find((result) => result.file === 'file3.yml'),
      ).toMatchObject({
        resultType: 'notExecuted',
        executed: false,
      });
    });

    test('does not start queued YAML files after an unexpected execution error', async () => {
      const executionError = new Error('execution exploded');
      vi.mocked(createYamlPlayer).mockImplementation(async (file) => {
        const player = createMockPlayer(true);
        if (file === 'file1.yml') {
          player.run = vi.fn().mockRejectedValue(executionError);
        }
        return player;
      });

      const runner = new BatchRunner({
        ...mockBatchConfig,
        concurrent: 1,
        continueOnError: false,
      });

      await expect(runner.run()).rejects.toBe(executionError);
      expect(
        vi.mocked(createYamlPlayer).mock.calls.map(([file]) => file),
      ).toEqual(['file1.yml']);
      expect(runner.getResults()).toEqual([
        expect.objectContaining({
          file: 'file1.yml',
          executed: true,
          resultType: 'failed',
          error: executionError.message,
        }),
        expect.objectContaining({
          file: 'file2.yml',
          executed: false,
          resultType: 'notExecuted',
        }),
        expect.objectContaining({
          file: 'file3.yml',
          executed: false,
          resultType: 'notExecuted',
        }),
      ]);
    });

    test('preserves an execution error when closing its page also fails', async () => {
      const executionError = new Error('execution exploded');
      const browser = createMockBrowser();
      const page = {
        browser: vi.fn(() => browser),
        close: vi.fn().mockRejectedValue(new Error('page close failed')),
        isClosed: vi.fn().mockReturnValue(false),
      };
      browser.newPage.mockResolvedValue(page);
      vi.mocked(puppeteer.launch).mockResolvedValue(
        browser as unknown as Browser,
      );
      vi.mocked(createYamlPlayer).mockImplementation(async () => {
        const player = createMockPlayer(true);
        player.run = vi.fn().mockRejectedValue(executionError);
        return player;
      });

      const runner = new BatchRunner({
        ...mockBatchConfig,
        shareBrowserContext: true,
        files: ['web1.yml'],
      });

      await expect(runner.run()).rejects.toBe(executionError);
      expect(page.close).toHaveBeenCalledTimes(1);
      expect(browser.close).toHaveBeenCalledTimes(1);
    });

    test('surfaces a page cleanup error after a successful execution', async () => {
      const browser = createMockBrowser();
      const page = {
        browser: vi.fn(() => browser),
        close: vi.fn().mockRejectedValue(new Error('page close failed')),
        isClosed: vi.fn().mockReturnValue(false),
      };
      browser.newPage.mockResolvedValue(page);
      vi.mocked(puppeteer.launch).mockResolvedValue(
        browser as unknown as Browser,
      );

      const runner = new BatchRunner({
        ...mockBatchConfig,
        shareBrowserContext: true,
        files: ['web1.yml'],
      });

      await expect(runner.run()).rejects.toThrow(
        'Failed to close a YAML execution page',
      );
      expect(page.close).toHaveBeenCalledTimes(1);
      expect(browser.close).toHaveBeenCalledTimes(1);
      expect(runner.getResults()).toEqual([
        expect.objectContaining({
          file: 'web1.yml',
          executed: true,
          resultType: 'failed',
          error: 'Failed to close a YAML execution page',
        }),
      ]);

      const summaryCall = vi
        .mocked(writeFileSync)
        .mock.calls.find(([path]) => path === '/test/output/test-summary.json');
      expect(summaryCall).toBeDefined();
      const summary = JSON.parse(summaryCall?.[1] as string);
      expect(summary.summary).toMatchObject({
        total: 1,
        successful: 0,
        failed: 1,
      });
    });
  });

  describe('Summary file generation', () => {
    test('generates summary file with correct name and path', async () => {
      const executor = new BatchRunner(mockBatchConfig);
      await executor.run();
      expect(getMidsceneRunSubDir).toHaveBeenCalledWith('output');
      expect(writeFileSync).toHaveBeenCalledWith(
        '/test/output/test-summary.json',
        expect.any(String),
      );
    });

    test('generates correct summary file structure', async () => {
      vi.mocked(createYamlPlayer).mockImplementation(async () =>
        createMockPlayer(true),
      );
      const executor = new BatchRunner(mockBatchConfig);
      await executor.run();
      const writeFileCalls = vi.mocked(writeFileSync).mock.calls;
      const summaryCall = writeFileCalls.find(
        (call) => call[0] === '/test/output/test-summary.json',
      );
      expect(summaryCall).toBeDefined();
      const summaryContent = JSON.parse(summaryCall![1] as string);
      expect(summaryContent).toHaveProperty('summary');
      expect(summaryContent).toHaveProperty('results');
      expect(summaryContent.summary).toHaveProperty('total', 3);
      expect(summaryContent.summary).toHaveProperty('successful', 3);
      expect(summaryContent.summary).toHaveProperty('failed', 0);
      expect(summaryContent.summary).toHaveProperty('generatedAt');
      expect(summaryContent.results).toHaveLength(3);
    });
  });

  describe('setup execution', () => {
    const setupConfig = {
      ...mockBatchConfig,
      shareBrowserContext: true,
      setup: 'login.yml',
      files: ['search.yml', 'report.yml'],
      concurrent: 2,
    };

    const trackRunOrder = (
      runOrder: string[],
      shouldSucceed: (file: string) => boolean,
    ) => {
      vi.mocked(createYamlPlayer).mockImplementation(async (file) => {
        const player = createMockPlayer(shouldSucceed(file as string));
        const originalRun = player.run;
        (player as unknown as { run: () => Promise<void> }).run = vi.fn(
          async () => {
            runOrder.push(file as string);
            return originalRun();
          },
        );
        return player;
      });
    };

    test('runs the setup file before the main files and executes all', async () => {
      const runOrder: string[] = [];
      trackRunOrder(runOrder, () => true);

      const runner = new BatchRunner(setupConfig);
      await runner.run();

      expect(runOrder[0]).toBe('login.yml');
      expect(runOrder).toContain('search.yml');
      expect(runOrder).toContain('report.yml');
      expect(runner.getNotExecutedFiles()).toEqual([]);
      expect(runner.getSuccessfulFiles().sort()).toEqual([
        'login.yml',
        'report.yml',
        'search.yml',
      ]);
    });

    test('runs parallel YAML files on isolated pages without carrying page-scoped state', async () => {
      const pageByFile = new Map<string, unknown>();
      const mainFiles = new Set(['search.yml', 'report.yml']);
      let setupFinished = false;
      let releaseMainFiles: (() => void) | undefined;
      const allMainFilesStarted = new Promise<void>((resolve) => {
        releaseMainFiles = resolve;
      });

      vi.mocked(createYamlPlayer).mockImplementation(
        async (file, _script, options) => {
          expect(options?.page).toBeDefined();
          const pageAtPlayerCreation = options?.page;
          const player = createMockPlayer(true);
          (player as unknown as { run: () => Promise<void> }).run = vi.fn(
            async () => {
              pageByFile.set(file, pageAtPlayerCreation);

              if (file === 'login.yml') {
                expect(pageByFile.size).toBe(1);
                setupFinished = true;
              } else {
                expect(setupFinished).toBe(true);
                if (
                  [...pageByFile.keys()].filter((name) => mainFiles.has(name))
                    .length === mainFiles.size
                ) {
                  releaseMainFiles?.();
                }
                await allMainFilesStarted;
              }

              player.status = 'done';
            },
          );
          return player;
        },
      );

      const runner = new BatchRunner(setupConfig);
      await runner.run();

      const setupPage = pageByFile.get('login.yml');
      const searchPage = pageByFile.get('search.yml');
      const reportPage = pageByFile.get('report.yml');
      expect(setupPage).toBeDefined();
      expect(searchPage).toBeDefined();
      expect(reportPage).toBeDefined();
      expect(new Set([setupPage, searchPage, reportPage]).size).toBe(3);

      const browser = await vi.mocked(puppeteer.launch).mock.results[0].value;
      expect(browser.newPage).toHaveBeenCalledTimes(3);
      for (const page of await browser.pages()) {
        expect(page.close).toHaveBeenCalledTimes(1);
      }
    });

    test('creates an isolated page for every YAML when concurrency is one', async () => {
      const pageByFile = new Map<string, unknown>();
      vi.mocked(createYamlPlayer).mockImplementation(
        async (file, _script, options) => {
          expect(options?.page).toBeDefined();
          const pageAtPlayerCreation = options?.page;
          const player = createMockPlayer(true);
          (player as unknown as { run: () => Promise<void> }).run = vi.fn(
            async () => {
              pageByFile.set(file, pageAtPlayerCreation);
              player.status = 'done';
            },
          );
          return player;
        },
      );

      const runner = new BatchRunner({
        ...setupConfig,
        concurrent: 1,
      });
      await runner.run();

      expect(pageByFile.size).toBe(3);
      expect(new Set(pageByFile.values()).size).toBe(3);

      const browser = await vi.mocked(puppeteer.launch).mock.results[0].value;
      expect(browser.newPage).toHaveBeenCalledTimes(3);
      for (const page of await browser.pages()) {
        expect(page.close).toHaveBeenCalledTimes(1);
      }
    });

    test('preserves a serial execution error when closing its page also fails', async () => {
      const executionError = new Error('serial execution exploded');
      const browser = createMockBrowser();
      browser.newPage.mockImplementation(async () => {
        const page = {
          browser: vi.fn(() => browser),
          close: vi.fn().mockRejectedValue(new Error('page close failed')),
          isClosed: vi.fn().mockReturnValue(false),
        };
        return page;
      });
      vi.mocked(puppeteer.launch).mockResolvedValue(
        browser as unknown as Browser,
      );
      vi.mocked(createYamlPlayer).mockImplementation(async () => {
        const player = createMockPlayer(true);
        player.run = vi.fn().mockRejectedValue(executionError);
        return player;
      });

      const runner = new BatchRunner({
        ...setupConfig,
        setup: undefined,
        files: ['web1.yml'],
        concurrent: 1,
      });

      await expect(runner.run()).rejects.toBe(executionError);
      expect(browser.newPage).toHaveBeenCalledTimes(1);
    });

    test('aborts main files when the setup file fails', async () => {
      const runOrder: string[] = [];
      trackRunOrder(runOrder, (file) => file !== 'login.yml');

      const runner = new BatchRunner(setupConfig);
      await runner.run();

      // The main files must never run once the prerequisite setup fails.
      expect(runOrder).toEqual(['login.yml']);
      expect(runner.getFailedFiles()).toEqual(['login.yml']);
      expect(runner.getNotExecutedFiles().sort()).toEqual([
        'report.yml',
        'search.yml',
      ]);
    });

    test('aborts main files when setup is only partially successful', async () => {
      const runOrder: string[] = [];
      vi.mocked(createYamlPlayer).mockImplementation(async (file) => {
        const player = createMockPlayer(true);
        (player as unknown as { run: () => Promise<void> }).run = vi.fn(
          async () => {
            runOrder.push(file);
            player.status = 'done';
            if (file === 'login.yml') {
              player.taskStatusList = [
                {
                  name: 'Optional-looking prerequisite',
                  flow: [{ javascript: 'false' }],
                  status: 'error',
                  totalSteps: 1,
                  currentStep: 0,
                  error: new Error('Login prerequisite failed'),
                },
              ];
            }
          },
        );
        return player;
      });

      const runner = new BatchRunner(setupConfig);
      await runner.run();

      expect(runOrder).toEqual(['login.yml']);
      expect(runner.getPartialFailedFiles()).toEqual(['login.yml']);
      expect(runner.getNotExecutedFiles().sort()).toEqual([
        'report.yml',
        'search.yml',
      ]);
    });

    test('throws when setup is set without shareBrowserContext', async () => {
      const config = {
        ...mockBatchConfig,
        shareBrowserContext: false,
        setup: 'login.yml',
        files: ['search.yml'],
      };
      const runner = new BatchRunner(config);
      await expect(runner.run()).rejects.toThrow(
        'setup requires shareBrowserContext: true',
      );
    });

    test('throws when a yaml file is both the setup and a main file', async () => {
      const config = {
        ...mockBatchConfig,
        shareBrowserContext: true,
        setup: 'login.yml',
        files: ['login.yml', 'search.yml'],
      };
      const runner = new BatchRunner(config);
      await expect(runner.run()).rejects.toThrow(
        'is used as both the setup file and a main file',
      );
    });
  });

  describe('Common functionality', () => {
    let executor: BatchRunner;
    beforeEach(() => {
      executor = new BatchRunner(mockBatchConfig);
    });

    test('getExecutionSummary returns correct summary', async () => {
      vi.mocked(createYamlPlayer).mockImplementation(async () =>
        createMockPlayer(true),
      );
      await executor.run();
      const summary = executor.getExecutionSummary();
      expect(summary.total).toBe(3);
      expect(summary.successful).toBe(3);
      expect(summary.failed).toBe(0);
      expect(summary.notExecuted).toBe(0);
      expect(typeof summary.totalDuration).toBe('number');
    });

    test('getFailedFiles returns failed files', async () => {
      vi.mocked(createYamlPlayer).mockImplementation(async (file) =>
        createMockPlayer(file !== 'file1.yml'),
      );
      const config = { ...mockBatchConfig, continueOnError: true };
      const executor = new BatchRunner(config);
      await executor.run();
      const failedFiles = executor.getFailedFiles();
      expect(failedFiles).toEqual(['file1.yml']);
    });

    test('getResults returns copy of results', async () => {
      await executor.run();
      const results = executor.getResults();
      expect(results).toHaveLength(3);
      results.push({} as any);
      expect(executor.getResults()).toHaveLength(3);
    });

    test('printExecutionSummary prints and returns success status', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(createYamlPlayer).mockImplementation(async () =>
        createMockPlayer(true),
      );
      await executor.run();
      const success = executor.printExecutionSummary();
      expect(success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('📊 Execution Summary:'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🎉 All files executed successfully!'),
      );
      consoleSpy.mockRestore();
    });

    test('printExecutionSummary shows failed files when there are failures', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(createYamlPlayer).mockImplementation(async (file) =>
        createMockPlayer(file !== 'file1.yml'),
      );
      const config = { ...mockBatchConfig, continueOnError: true };
      const executor = new BatchRunner(config);
      await executor.run();
      const success = executor.printExecutionSummary();
      expect(success).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed files'),
      );
      consoleSpy.mockRestore();
    });

    test('continueOnError: failed tasks should be counted as failed files', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Create a mock player that simulates continueOnError behavior:
      // - player.status = 'done' (execution completed)
      // - but taskStatusList contains failed tasks
      const createMockPlayerWithFailedTasks = (
        fileName: string,
      ): ScriptPlayer<MidsceneYamlScriptEnv> => {
        const isFile1 = fileName === 'file1.yml';
        const mockPlayer = {
          status: 'done' as ScriptPlayerStatusValue, // Always 'done' with continueOnError
          output: '/test/output/file.json',
          reportFile: '/test/report.html',
          result: { test: 'data' },
          errorInSetup: null,
          taskStatusList: isFile1
            ? [
                {
                  status: 'error',
                  error: new Error(
                    'Assertion failed: this is not a search engine',
                  ),
                },
                { status: 'done' },
              ]
            : [{ status: 'done' }],
          run: vi.fn().mockImplementation(async () => {
            return undefined;
          }),
          script: mockYamlScript,
          setupAgent: vi.fn(),
          unnamedResultIndex: 0,
          pageAgent: null,
          currentTaskIndex: undefined,
          agentStatusTip: '',
        };
        return mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      };

      vi.mocked(createYamlPlayer).mockImplementation(async (file) =>
        createMockPlayerWithFailedTasks(file),
      );

      const config = { ...mockBatchConfig, continueOnError: true };
      const executor = new BatchRunner(config);
      await executor.run();

      const summary = executor.getExecutionSummary();
      const success = executor.printExecutionSummary();

      // Files with failed tasks and continueOnError should be counted as partialFailed
      expect(summary.partialFailed).toBe(1);
      expect(summary.failed).toBe(0); // No complete failures
      expect(summary.successful).toBe(2); // The other two files succeeded
      expect(success).toBe(false); // Overall should still be false due to partial failure
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Partial failed files'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('BatchRunner output file existence check', () => {
    test('output field contains file path when file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();
      expect(results[0].output).toBe('/test/output/file.json');
    });

    test('output field is undefined when file does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();
      expect(results[0].output).toBeUndefined();
    });

    test('output field is undefined when player.output is null', async () => {
      vi.mocked(createYamlPlayer).mockImplementation(async () => {
        const mockPlayer = createMockPlayer(true);
        mockPlayer.output = null as any;
        return mockPlayer;
      });
      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();
      expect(results[0].output).toBeUndefined();
    });

    test('existsSync is called with correct file path', async () => {
      const mockExistsSync = vi.mocked(existsSync).mockReturnValue(true);
      const executor = new BatchRunner(mockBatchConfig);
      await executor.run();
      expect(mockExistsSync).toHaveBeenCalledWith('/test/output/file.json');
    });
  });

  describe('Error message collection in summary', () => {
    test('should collect specific error message from failed task instead of generic "Execution failed"', async () => {
      vi.mocked(createYamlPlayer).mockImplementation(async () => {
        const mockPlayer = {
          status: 'error' as ScriptPlayerStatusValue,
          output: '/test/output/file.json',
          reportFile: '/test/report.html',
          result: {},
          errorInSetup: null,
          taskStatusList: [
            {
              status: 'error',
              error: new Error('Specific error: element not found on page'),
            },
          ],
          run: vi.fn().mockImplementation(async () => undefined),
          script: mockYamlScript,
          setupAgent: vi.fn(),
          unnamedResultIndex: 0,
          pageAgent: null,
          currentTaskIndex: undefined,
          agentStatusTip: '',
        };
        return mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      const config = { ...mockBatchConfig, files: ['fail.yml'] };
      const executor = new BatchRunner(config);
      const results = await executor.run();

      expect(results[0].error).toBe(
        'Specific error: element not found on page',
      );
      expect(results[0].error).not.toBe('Execution failed');
    });

    test('should join multiple task error messages with semicolons', async () => {
      vi.mocked(createYamlPlayer).mockImplementation(async () => {
        const mockPlayer = {
          status: 'done' as ScriptPlayerStatusValue,
          output: '/test/output/file.json',
          reportFile: '/test/report.html',
          result: {},
          errorInSetup: null,
          taskStatusList: [
            { status: 'error', error: new Error('First task failed') },
            { status: 'done' },
            { status: 'error', error: new Error('Third task failed') },
          ],
          run: vi.fn().mockImplementation(async () => undefined),
          script: mockYamlScript,
          setupAgent: vi.fn(),
          unnamedResultIndex: 0,
          pageAgent: null,
          currentTaskIndex: undefined,
          agentStatusTip: '',
        };
        return mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      const config = {
        ...mockBatchConfig,
        files: ['fail.yml'],
        continueOnError: true,
      };
      const executor = new BatchRunner(config);
      const results = await executor.run();

      expect(results[0].error).toBe('First task failed; Third task failed');
    });

    test('should use errorInSetup message when available', async () => {
      vi.mocked(createYamlPlayer).mockImplementation(async () => {
        const mockPlayer = {
          status: 'error' as ScriptPlayerStatusValue,
          output: '/test/output/file.json',
          reportFile: '/test/report.html',
          result: {},
          errorInSetup: new Error('Setup failed: invalid URL'),
          taskStatusList: [],
          run: vi.fn().mockImplementation(async () => undefined),
          script: mockYamlScript,
          setupAgent: vi.fn(),
          unnamedResultIndex: 0,
          pageAgent: null,
          currentTaskIndex: undefined,
          agentStatusTip: '',
        };
        return mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      const config = { ...mockBatchConfig, files: ['fail.yml'] };
      const executor = new BatchRunner(config);
      const results = await executor.run();

      expect(results[0].error).toBe('Setup failed: invalid URL');
    });
  });

  describe('Global config merging', () => {
    const baseFileConfig: MidsceneYamlScript = {
      tasks: [{ name: 'test task', flow: [{ ai: 'do something' }] }],
      web: { url: 'http://file.com', userAgent: 'file-agent' },
      android: { deviceId: 'file-device', launch: 'file.app' },
    };

    test('should not modify file config if no global config is provided', async () => {
      const runner = new BatchRunner({
        ...mockBatchConfig,
        files: ['file1.yml'],
        globalConfig: undefined,
        headed: false,
        keepWindow: false,
        dotenvDebug: true,
        dotenvOverride: false,
      });
      vi.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(baseFileConfig)),
      );

      await runner.run();

      const createYamlPlayerSpy = vi.mocked(createYamlPlayer);
      expect(createYamlPlayerSpy).toHaveBeenCalled();
      const call = createYamlPlayerSpy.mock.calls[0];
      // The script passed to the player should be unchanged
      expect(call[1]).toEqual(baseFileConfig);
    });

    test('should override file config with global config', async () => {
      const runner = new BatchRunner({
        ...mockBatchConfig,
        files: ['file1.yml'],
        globalConfig: {
          web: {
            url: 'http://global.com',
            serve: '/global/serve',
            userAgent: 'global-agent',
          },
        },
        headed: false,
        keepWindow: false,
        dotenvDebug: true,
        dotenvOverride: false,
      });
      vi.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(baseFileConfig)),
      );

      await runner.run();

      const createYamlPlayerSpy = vi.mocked(createYamlPlayer);
      const call = createYamlPlayerSpy.mock.calls[0];
      const script = call[1]!;

      // url and userAgent should be overridden by global config
      expect(script.web?.url).toBe('http://global.com');
      expect(script.web?.userAgent).toBe('global-agent');
      // serve should be added from global config
      expect(script.web?.serve).toBe('/global/serve');
    });

    test('should merge android config from global config, overriding existing values', async () => {
      const runner = new BatchRunner({
        ...mockBatchConfig,
        files: ['file1.yml'],
        globalConfig: {
          android: { launch: 'global.app', deviceId: 'global-device' },
        },
        headed: false,
        keepWindow: false,
        dotenvDebug: true,
        dotenvOverride: false,
      });
      vi.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(baseFileConfig)),
      );

      await runner.run();

      const createYamlPlayerSpy = vi.mocked(createYamlPlayer);
      const call = createYamlPlayerSpy.mock.calls[0];
      const script = call[1]!;

      // Should be overridden
      expect(script.android?.launch).toBe('global.app');
      expect(script.android?.deviceId).toBe('global-device');
    });

    test('should create web/android config if it does not exist in file config', async () => {
      const fileConfigWithoutWebAndroid = {
        tasks: [{ name: 'test task', flow: [{ ai: 'do something' }] }],
      };
      const runner = new BatchRunner({
        ...mockBatchConfig,
        files: ['file1.yml'],
        globalConfig: {
          web: { url: 'http://global.com' },
          android: { deviceId: 'global-device' },
        },
        headed: false,
        keepWindow: false,
        dotenvDebug: true,
        dotenvOverride: false,
      });
      vi.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(fileConfigWithoutWebAndroid)),
      );

      await runner.run();

      const createYamlPlayerSpy = vi.mocked(createYamlPlayer);
      const call = createYamlPlayerSpy.mock.calls[0];
      const script = call[1]!;

      expect(script.web).toBeDefined();
      expect(script.web?.url).toBe('http://global.com');
      expect(script.android).toBeDefined();
      expect(script.android?.deviceId).toBe('global-device');
    });

    test('should not launch puppeteer if no web tasks are present', async () => {
      const puppeteer = await import('puppeteer');
      const launchSpy = vi.spyOn(puppeteer.default, 'launch');

      const runner = new BatchRunner({
        ...mockBatchConfig,
        files: ['android-only.yml'],
        globalConfig: undefined,
        headed: false,
        keepWindow: false,
        dotenvDebug: true,
        dotenvOverride: false,
      });

      const androidOnlyScript = {
        tasks: [{ name: 'android task', flow: [{ ai: 'do something' }] }],
        android: { deviceId: 'test-device' },
      };
      vi.mocked(parseYamlScript).mockReturnValue(androidOnlyScript);

      await runner.run();

      expect(launchSpy).not.toHaveBeenCalled();
      expect(createYamlPlayer).toHaveBeenCalledWith(
        'android-only.yml',
        androidOnlyScript,
        expect.any(Object),
      );

      launchSpy.mockRestore();
    });
  });
});
