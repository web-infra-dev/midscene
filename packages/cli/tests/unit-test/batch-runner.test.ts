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
import * as coreYamlActual from '@midscene/core/yaml' with {
  rstest: 'importActual',
};
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import * as puppeteerAgentLauncherActual from '@midscene/web/puppeteer-agent-launcher' with {
  rstest: 'importActual',
};
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import puppeteer from 'puppeteer';

// Mock all dependencies
// TODO(rstest): drop { mock: true } when bare auto-automock lands — https://github.com/web-infra-dev/rspack/pull/14418
rs.mock('node:fs', { mock: true });
rs.mock('puppeteer', () => ({
  default: {
    launch: rs.fn().mockResolvedValue({
      close: rs.fn().mockResolvedValue(undefined),
      newPage: rs.fn().mockResolvedValue({
        browser: rs.fn().mockReturnValue({}),
        close: rs.fn().mockResolvedValue(undefined),
      }),
    }),
    connect: rs.fn().mockResolvedValue({
      disconnect: rs.fn(),
      close: rs.fn().mockResolvedValue(undefined),
      newPage: rs.fn().mockResolvedValue({
        browser: rs.fn().mockReturnValue({}),
        close: rs.fn().mockResolvedValue(undefined),
      }),
      pages: rs.fn().mockResolvedValue([]),
    }),
  },
}));
rs.mock('@/create-yaml-player', { mock: true });
rs.mock('@midscene/shared/common', { mock: true });
rs.mock('@midscene/core/yaml', () => ({
  ...coreYamlActual,
  parseYamlScript: rs.fn(),
}));
rs.mock('@/printer', () => ({
  isTTY: false,
  contextInfo: rs.fn().mockReturnValue({ mergedText: 'test info' }),
  contextTaskListSummary: rs.fn().mockReturnValue('test summary'),
  spinnerInterval: 80,
}));
rs.mock('@/tty-renderer', { mock: true });
rs.mock('@midscene/web/puppeteer-agent-launcher', () => ({
  ...puppeteerAgentLauncherActual,
  buildDownloadBehavior: (downloadPath: string | undefined) =>
    downloadPath
      ? {
          policy: 'allow',
          downloadPath: downloadPath.startsWith('/')
            ? downloadPath
            : `${process.cwd()}/${downloadPath.replace(/^\.\//, '')}`,
        }
      : undefined,
}));
rs.mock('@midscene/web/bridge-mode', { mock: true });
rs.mock('@midscene/android', { mock: true });

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
    run: rs.fn().mockImplementation(async () => {
      mockPlayer.status = success ? 'done' : 'error';
      return undefined;
    }),
    script: mockYamlScript,
    setupAgent: rs.fn(),
    unnamedResultIndex: 0,
    pageAgent: null,
    currentTaskIndex: undefined,
    agentStatusTip: '',
  };
  return mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
};

describe('BatchRunner', () => {
  beforeEach(() => {
    rs.clearAllMocks();

    rs.mocked(readFileSync).mockReturnValue('mock yaml content');
    rs.mocked(mkdirSync).mockImplementation(() => undefined);
    rs.mocked(writeFileSync).mockImplementation(() => undefined);
    rs.mocked(statSync).mockReturnValue({ isFile: () => true } as Stats);
    rs.mocked(existsSync).mockReturnValue(true);

    rs.mocked(parseYamlScript).mockReturnValue(
      mockYamlScript as MidsceneYamlScript,
    );

    rs.mocked(createYamlPlayer).mockImplementation(async () =>
      createMockPlayer(),
    );

    rs.mocked(getMidsceneRunSubDir).mockReturnValue('/test/output');
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

      const browserInstance = (await rs.mocked(puppeteer.launch).mock.results[0]
        .value) as any;
      expect(rs.mocked(createYamlPlayer)).toHaveBeenCalledWith(
        'web1.yml',
        expect.any(Object),
        expect.objectContaining({ browser: browserInstance }),
      );
      expect(rs.mocked(createYamlPlayer)).toHaveBeenCalledWith(
        'web2.yml',
        expect.any(Object),
        expect.objectContaining({ browser: browserInstance }),
      );
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
      const launchCall = rs.mocked(puppeteer.launch).mock.calls[0][0];
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

      const launchCall = rs.mocked(puppeteer.launch).mock.calls[0][0];
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

      const launchCall = rs.mocked(puppeteer.launch).mock.calls[0][0];
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

      expect(rs.mocked(createYamlPlayer)).toHaveBeenCalledWith(
        'web1.yml',
        expect.any(Object),
        expect.not.objectContaining({ browser: expect.anything() }),
      );
      expect(rs.mocked(createYamlPlayer)).toHaveBeenCalledWith(
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
      rs.mocked(parseYamlScript).mockReturnValue({
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
      const mockDisconnect = rs.fn();
      const mockClose = rs.fn().mockResolvedValue(undefined);
      rs.mocked(puppeteer.connect).mockResolvedValue({
        disconnect: mockDisconnect,
        close: mockClose,
        newPage: rs.fn().mockResolvedValue({
          browser: rs.fn().mockReturnValue({}),
          close: rs.fn().mockResolvedValue(undefined),
        }),
        pages: rs.fn().mockResolvedValue([]),
      } as any);

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
      rs.mocked(createYamlPlayer).mockImplementation(async () =>
        createMockPlayer(true),
      );
      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    test('run executes files successfully with options', async () => {
      rs.mocked(createYamlPlayer).mockImplementation(async () =>
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
      rs.mocked(createYamlPlayer).mockImplementation(async () => {
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
      rs.mocked(createYamlPlayer).mockImplementation(async () => {
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
      rs.mocked(createYamlPlayer).mockImplementation(async () =>
        createMockPlayer(true),
      );
      const executor = new BatchRunner(mockBatchConfig);
      await executor.run();
      const writeFileCalls = rs.mocked(writeFileSync).mock.calls;
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

  describe('Common functionality', () => {
    let executor: BatchRunner;
    beforeEach(() => {
      executor = new BatchRunner(mockBatchConfig);
    });

    test('getExecutionSummary returns correct summary', async () => {
      rs.mocked(createYamlPlayer).mockImplementation(async () =>
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
      rs.mocked(createYamlPlayer).mockImplementation(async (file) =>
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
      const consoleSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
      rs.mocked(createYamlPlayer).mockImplementation(async () =>
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
      const consoleSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
      rs.mocked(createYamlPlayer).mockImplementation(async (file) =>
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
      const consoleSpy = rs.spyOn(console, 'log').mockImplementation(() => {});

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
          run: rs.fn().mockImplementation(async () => {
            return undefined;
          }),
          script: mockYamlScript,
          setupAgent: rs.fn(),
          unnamedResultIndex: 0,
          pageAgent: null,
          currentTaskIndex: undefined,
          agentStatusTip: '',
        };
        return mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      };

      rs.mocked(createYamlPlayer).mockImplementation(async (file) =>
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
      rs.mocked(existsSync).mockReturnValue(true);
      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();
      expect(results[0].output).toBe('/test/output/file.json');
    });

    test('output field is undefined when file does not exist', async () => {
      rs.mocked(existsSync).mockReturnValue(false);
      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();
      expect(results[0].output).toBeUndefined();
    });

    test('output field is undefined when player.output is null', async () => {
      rs.mocked(createYamlPlayer).mockImplementation(async () => {
        const mockPlayer = createMockPlayer(true);
        mockPlayer.output = null as any;
        return mockPlayer;
      });
      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();
      expect(results[0].output).toBeUndefined();
    });

    test('existsSync is called with correct file path', async () => {
      const mockExistsSync = rs.mocked(existsSync).mockReturnValue(true);
      const executor = new BatchRunner(mockBatchConfig);
      await executor.run();
      expect(mockExistsSync).toHaveBeenCalledWith('/test/output/file.json');
    });
  });

  describe('Error message collection in summary', () => {
    test('should collect specific error message from failed task instead of generic "Execution failed"', async () => {
      rs.mocked(createYamlPlayer).mockImplementation(async () => {
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
          run: rs.fn().mockImplementation(async () => undefined),
          script: mockYamlScript,
          setupAgent: rs.fn(),
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
      rs.mocked(createYamlPlayer).mockImplementation(async () => {
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
          run: rs.fn().mockImplementation(async () => undefined),
          script: mockYamlScript,
          setupAgent: rs.fn(),
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
      rs.mocked(createYamlPlayer).mockImplementation(async () => {
        const mockPlayer = {
          status: 'error' as ScriptPlayerStatusValue,
          output: '/test/output/file.json',
          reportFile: '/test/report.html',
          result: {},
          errorInSetup: new Error('Setup failed: invalid URL'),
          taskStatusList: [],
          run: rs.fn().mockImplementation(async () => undefined),
          script: mockYamlScript,
          setupAgent: rs.fn(),
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
      rs.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(baseFileConfig)),
      );

      await runner.run();

      const createYamlPlayerSpy = rs.mocked(createYamlPlayer);
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
      rs.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(baseFileConfig)),
      );

      await runner.run();

      const createYamlPlayerSpy = rs.mocked(createYamlPlayer);
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
      rs.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(baseFileConfig)),
      );

      await runner.run();

      const createYamlPlayerSpy = rs.mocked(createYamlPlayer);
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
      rs.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(fileConfigWithoutWebAndroid)),
      );

      await runner.run();

      const createYamlPlayerSpy = rs.mocked(createYamlPlayer);
      const call = createYamlPlayerSpy.mock.calls[0];
      const script = call[1]!;

      expect(script.web).toBeDefined();
      expect(script.web?.url).toBe('http://global.com');
      expect(script.android).toBeDefined();
      expect(script.android?.deviceId).toBe('global-device');
    });

    test('should not launch puppeteer if no web tasks are present', async () => {
      const puppeteer = await import('puppeteer');
      const launchSpy = rs.spyOn(puppeteer.default, 'launch');

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
      rs.mocked(parseYamlScript).mockReturnValue(androidOnlyScript);

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
