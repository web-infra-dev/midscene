import {
  type Stats,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { BatchRunner } from '@/batch-runner';
import { createYamlPlayer } from '@/create-yaml-player';
import type {
  MidsceneYamlScript,
  MidsceneYamlScriptEnv,
  ScriptPlayerStatusValue,
} from '@midscene/core';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { parseYamlScript, type ScriptPlayer } from '@midscene/web/yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock all dependencies
vi.mock('node:fs');
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));
vi.mock('@/create-yaml-player');
vi.mock('@midscene/shared/common');
vi.mock('@midscene/web/yaml', async (importOriginal) => {
  const original = await importOriginal<typeof import('@midscene/web/yaml')>();
  return {
    ...original,
    parseYamlScript: vi.fn(),
  };
});
vi.mock('@/printer', () => ({
  isTTY: false,
  contextInfo: vi.fn().mockReturnValue({ mergedText: 'test info' }),
  contextTaskListSummary: vi.fn().mockReturnValue('test summary'),
  spinnerInterval: 80,
}));
vi.mock('@/tty-renderer');
vi.mock('@midscene/web/puppeteer-agent-launcher');
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
      const results = await executor.run({
        keepWindow: true,
        headed: true,
      });
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

    test('should merge web config from global config without overriding existing values', async () => {
      const runner = new BatchRunner({
        ...mockBatchConfig,
        files: ['file1.yml'],
        globalConfig: {
          web: { url: 'http://global.com', serve: '/global/serve' },
        },
      });
      vi.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(baseFileConfig)),
      );

      await runner.run();

      const createYamlPlayerSpy = vi.mocked(createYamlPlayer);
      const call = createYamlPlayerSpy.mock.calls[0];
      const script = call[1]!;

      // Should not be overridden
      expect(script.web?.url).toBe('http://file.com');
      // Should be added from global config
      expect(script.web?.serve).toBe('/global/serve');
      // Should not be touched
      expect(script.web?.userAgent).toBe('file-agent');
    });

    test('should merge android config from global config without overriding existing values', async () => {
      const runner = new BatchRunner({
        ...mockBatchConfig,
        files: ['file1.yml'],
        globalConfig: {
          android: { launch: 'global.app', deviceId: 'global-device' },
        },
      });
      vi.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(baseFileConfig)),
      );

      await runner.run();

      const createYamlPlayerSpy = vi.mocked(createYamlPlayer);
      const call = createYamlPlayerSpy.mock.calls[0];
      const script = call[1]!;

      // Should not be overridden
      expect(script.android?.launch).toBe('file.app');
      expect(script.android?.deviceId).toBe('file-device');
    });

    test('should add values from global config if they are missing in file config', async () => {
      const fileConfigWithMissingValues: MidsceneYamlScript = {
        tasks: [{ name: 'test task', flow: [{ ai: 'do something' }] }],
        web: { userAgent: 'file-agent' }, // missing url and serve
        android: { launch: 'file.app' }, // missing deviceId
      };

      const runner = new BatchRunner({
        ...mockBatchConfig,
        files: ['file1.yml'],
        globalConfig: {
          web: { url: 'http://global.com', serve: '/global/serve' },
          android: { deviceId: 'global-device' },
        },
      });
      vi.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(fileConfigWithMissingValues)),
      );

      await runner.run();

      const createYamlPlayerSpy = vi.mocked(createYamlPlayer);
      const call = createYamlPlayerSpy.mock.calls[0];
      const script = call[1]!;

      // Check added values
      expect(script.web?.url).toBe('http://global.com');
      expect(script.web?.serve).toBe('/global/serve');
      expect(script.android?.deviceId).toBe('global-device');

      // Check existing values are untouched
      expect(script.web?.userAgent).toBe('file-agent');
      expect(script.android?.launch).toBe('file.app');
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

    test('should handle single file execution without global config correctly', async () => {
      const singleFileConfig = {
        ...mockBatchConfig,
        files: ['file1.yml'],
        globalConfig: undefined, // Explicitly no global config
      };
      const runner = new BatchRunner(singleFileConfig);
      const androidConfigOnly = {
        tasks: [{ name: 'test task', flow: [{ ai: 'do something' }] }],
        android: { deviceId: 'test-device' },
      };
      vi.mocked(parseYamlScript).mockReturnValue(
        JSON.parse(JSON.stringify(androidConfigOnly)),
      );

      await runner.run();

      const createYamlPlayerSpy = vi.mocked(createYamlPlayer);
      expect(createYamlPlayerSpy).toHaveBeenCalled();
      const call = createYamlPlayerSpy.mock.calls[0];
      // The script passed to the player should be the same as the file content
      expect(call[1]).toEqual(androidConfigOnly);
    });

    test('should not launch puppeteer if no web tasks are present', async () => {
      const puppeteer = await import('puppeteer');
      const launchSpy = vi.spyOn(puppeteer.default, 'launch');

      const runner = new BatchRunner({
        ...mockBatchConfig,
        files: ['android-only.yml'],
        globalConfig: undefined,
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
