import {
  type Stats,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { BatchRunner } from '@/batch-runner';
import { parseIndexYaml } from '@/config-factory';
import type {
  MidsceneYamlScript,
  MidsceneYamlScriptEnv,
  ScriptPlayerStatusValue,
} from '@midscene/core';
import { ScriptPlayer, parseYamlScript } from '@midscene/web/yaml';
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
vi.mock('@/config-factory', () => ({
  parseIndexYaml: vi.fn(),
}));
vi.mock('@midscene/web/yaml');
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

// Mock the parsed config for index YAML mode
const mockIndexConfig = {
  concurrent: 2,
  continueOnError: false,
  web: { url: 'http://example.com' },
  files: ['file1.yml', 'file2.yml'],
  outputPath: '/test/output',
  patterns: ['*.yml'],
};

const mockBatchConfig = {
  files: ['file1.yml', 'file2.yml', 'file3.yml'],
  concurrent: 2,
  continueOnError: false,
  globalConfig: {
    web: { url: 'http://example.com' },
  },
};

const mockBatchConfigWithIndexFileName = {
  files: ['file1.yml', 'file2.yml', 'file3.yml'],
  concurrent: 2,
  continueOnError: false,
  indexFileName: 'test-index',
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
const createMockPlayer = (success = true) => {
  const mockPlayer = {
    status: 'init' as ScriptPlayerStatusValue,
    output: '/test/output/file.json',
    reportFile: '/test/report.html',
    result: { test: 'data' },
    errorInSetup: success ? null : new Error('Mock error'),
    taskStatusList: [],
    run: vi.fn().mockImplementation(async () => {
      // Simulate the run method changing the status
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

    // Mock config factory functions
    vi.mocked(parseIndexYaml).mockResolvedValue(mockIndexConfig);

    // Mock fs functions
    vi.mocked(readFileSync).mockReturnValue('mock yaml content');
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    vi.mocked(writeFileSync).mockImplementation(() => undefined);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as Stats);
    vi.mocked(existsSync).mockReturnValue(true); // Default to file exists

    // Mock parseYamlScript
    vi.mocked(parseYamlScript).mockReturnValue(
      mockYamlScript as MidsceneYamlScript,
    );

    // Mock ScriptPlayer constructor with simpler implementation
    vi.mocked(ScriptPlayer).mockImplementation(() => {
      return createMockPlayer();
    });
  });

  describe('BatchRunner execution', () => {
    test('constructor creates executor with config', async () => {
      const executor = new BatchRunner(mockBatchConfig);
      expect(executor).toBeDefined();
    });

    test('run executes files successfully with default options', async () => {
      const executor = new BatchRunner(mockBatchConfig);

      const results = await executor.run();

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
    });

    test('run executes files successfully with options', async () => {
      const executor = new BatchRunner(mockBatchConfig);

      const results = await executor.run({
        keepWindow: true,
        headed: true,
      });

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
    });
  });

  describe('BatchRunner concurrent execution', () => {
    test('run stops on first failure when continueOnError=false', async () => {
      // Clear previous mock and set up new one for this test
      vi.clearAllMocks();

      // Re-setup required mocks
      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(mkdirSync).mockImplementation(() => undefined);
      vi.mocked(writeFileSync).mockImplementation(() => undefined);
      vi.mocked(statSync).mockReturnValue({ isFile: () => true } as Stats);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(parseYamlScript).mockReturnValue(
        mockYamlScript as MidsceneYamlScript,
      );

      // Create a config that doesn't continue on error
      const configWithoutContinueOnError = {
        ...mockBatchConfig,
        continueOnError: false,
      };

      let callCount = 0;
      vi.mocked(ScriptPlayer).mockImplementation(() => {
        const shouldFail = callCount === 0; // first call should fail
        callCount++;
        return createMockPlayer(!shouldFail);
      });

      const executor = new BatchRunner(configWithoutContinueOnError);

      const results = await executor.run();

      // In batch mode with continueOnError=false, both tasks might still execute concurrently
      // but the first one should fail
      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Mock error');
      expect(results[1].success).toBe(true);
    });
  });

  describe('indexFileName functionality', () => {
    test('BatchRunner generates output index when indexFileName is provided', async () => {
      const executor = new BatchRunner(mockBatchConfigWithIndexFileName);

      await executor.run();

      // Check that writeFileSync was called for the index file
      const writeFileCalls = vi.mocked(writeFileSync).mock.calls;
      const indexCall = writeFileCalls.find(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('test-index-'),
      );

      expect(indexCall).toBeDefined();
      expect(indexCall![0]).toMatch(/test-index-\d+\.json$/);

      const indexContent = JSON.parse(indexCall![1] as string);
      expect(indexContent.summary.total).toBe(3);
    });

    test('BatchRunner uses global output path when provided', async () => {
      const configWithGlobalOutput = {
        ...mockBatchConfigWithIndexFileName,
        globalConfig: {
          web: {
            url: 'http://example.com',
            output: '/custom/output/path/index.json',
          },
        },
      };

      const executor = new BatchRunner(configWithGlobalOutput);

      await executor.run();

      // Check that writeFileSync was called with the global output path
      const writeFileCalls = vi.mocked(writeFileSync).mock.calls;
      const indexCall = writeFileCalls.find(
        (call) => call[0] === '/custom/output/path/index.json',
      );

      expect(indexCall).toBeDefined();
      const indexContent = JSON.parse(indexCall![1] as string);
      expect(indexContent.summary.total).toBe(3);
    });

    test('BatchRunner does not generate output index when indexFileName is not provided', async () => {
      const executor = new BatchRunner(mockBatchConfig);

      await executor.run();

      // Check that writeFileSync was not called for index file generation
      // (it may still be called for other purposes, so we check the specific pattern)
      const writeFileCalls = vi.mocked(writeFileSync).mock.calls;
      const indexFileCalls = writeFileCalls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('output'),
      );
      expect(indexFileCalls).toHaveLength(0);
    });

    test('BatchRunner generates correct index file structure', async () => {
      const executor = new BatchRunner(mockBatchConfigWithIndexFileName);

      await executor.run();

      // Check that the index file contains the expected structure
      const writeFileCalls = vi.mocked(writeFileSync).mock.calls;
      const indexCall = writeFileCalls.find(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('test-index-'),
      );

      expect(indexCall).toBeDefined();
      const indexContent = JSON.parse(indexCall![1] as string);

      expect(indexContent).toHaveProperty('summary');
      expect(indexContent).toHaveProperty('results');
      expect(indexContent.summary).toHaveProperty('total', 3);
      expect(indexContent.summary).toHaveProperty('successful', 3);
      expect(indexContent.summary).toHaveProperty('failed', 0);
      expect(indexContent.summary).toHaveProperty('generatedAt');
      expect(indexContent.results).toHaveLength(3);
    });

    test('BatchRunner uses android global output path when provided', async () => {
      const configWithAndroidOutput = {
        ...mockBatchConfigWithIndexFileName,
        globalConfig: {
          android: {
            launch: 'com.example.app',
            output: '/android/output/path/index.json',
          },
        },
      };

      const executor = new BatchRunner(configWithAndroidOutput);

      await executor.run();

      // Check that writeFileSync was called with the android output path
      const writeFileCalls = vi.mocked(writeFileSync).mock.calls;
      const indexCall = writeFileCalls.find(
        (call) => call[0] === '/android/output/path/index.json',
      );

      expect(indexCall).toBeDefined();
      const indexContent = JSON.parse(indexCall![1] as string);
      expect(indexContent.summary.total).toBe(3);
    });

    test('BatchRunner filename generation uses timestamp format', async () => {
      const executor = new BatchRunner(mockBatchConfigWithIndexFileName);

      await executor.run();

      // Check that the generated filename follows the pattern: indexFileName-timestamp.json
      const writeFileCalls = vi.mocked(writeFileSync).mock.calls;
      const indexCall = writeFileCalls.find(
        (call) =>
          typeof call[0] === 'string' && call[0].includes('test-index-'),
      );

      expect(indexCall).toBeDefined();
      const filePath = indexCall![0] as string;

      // Should match pattern like: test-index-1234567890.json
      expect(filePath).toMatch(/test-index-\d+\.json$/);
    });
  });

  describe('Common functionality', () => {
    let executor: BatchRunner;

    beforeEach(async () => {
      executor = new BatchRunner(mockBatchConfig);
    });

    test('getExecutionSummary returns correct summary', async () => {
      await executor.run();

      const summary = executor.getExecutionSummary();
      expect(summary.total).toBe(3);
      expect(summary.successful).toBe(3);
      expect(summary.failed).toBe(0);
      expect(typeof summary.totalDuration).toBe('number');
    });

    test('getFailedFiles returns failed files', async () => {
      // Mock a failed execution
      vi.mocked(ScriptPlayer).mockImplementationOnce(() => {
        return createMockPlayer(false);
      });

      await executor.run();

      const failedFiles = executor.getFailedFiles();
      expect(failedFiles).toHaveLength(1);
    });

    test('getResults returns copy of results', async () => {
      await executor.run();

      const results = executor.getResults();
      expect(results).toHaveLength(3);
    });

    test('printExecutionSummary prints and returns success status', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

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

      // Mock a failed execution
      vi.mocked(ScriptPlayer).mockImplementationOnce(() => {
        return createMockPlayer(false);
      });

      await executor.run();
      const success = executor.printExecutionSummary();

      expect(success).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Failed files:'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('BatchRunner output file existence check', () => {
    test('output field contains file path when file exists', async () => {
      // Mock file exists
      vi.mocked(existsSync).mockReturnValue(true);

      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[0].output).toBe('/test/output/file.json');
      expect(results[0].executed).toBe(true);
    });

    test('output field is undefined when file does not exist', async () => {
      // Mock file does not exist
      vi.mocked(existsSync).mockReturnValue(false);

      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();

      expect(results).toHaveLength(3);
      expect(results[0].output).toBeUndefined();
      expect(results[0].executed).toBe(true);
    });

    test('output field is undefined when player.output is null', async () => {
      // Mock player with null output
      vi.mocked(ScriptPlayer).mockImplementation(() => {
        const mockPlayer = createMockPlayer(true);
        mockPlayer.output = null;
        return mockPlayer;
      });

      const executor = new BatchRunner(mockBatchConfig);
      const results = await executor.run();

      expect(results).toHaveLength(3);
      expect(results[0].output).toBeUndefined();
      expect(results[0].executed).toBe(true);
    });

    test('existsSync is called with correct file path', async () => {
      const mockExistsSync = vi.mocked(existsSync).mockReturnValue(true);

      const executor = new BatchRunner(mockBatchConfig);
      await executor.run();

      expect(mockExistsSync).toHaveBeenCalledWith('/test/output/file.json');
    });
  });

  describe('BatchRunner error handling', () => {
    test('run handles continueOnError=true', async () => {
      const configWithContinueOnError = {
        ...mockBatchConfig,
        continueOnError: true,
      };

      const executor = new BatchRunner(configWithContinueOnError);

      // Mock one successful and one failed execution
      vi.mocked(ScriptPlayer)
        .mockImplementationOnce(() => {
          return createMockPlayer(true);
        })
        .mockImplementationOnce(() => {
          return createMockPlayer(false);
        });

      const results = await executor.run();

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[0].executed).toBe(true);
      expect(results[1].executed).toBe(true);
    });

    test('run handles continueOnError=false', async () => {
      const configWithContinueOnError = {
        ...mockBatchConfig,
        continueOnError: false,
      };

      // Clear previous mock and set up new one for this test
      vi.clearAllMocks();

      // Re-setup required mocks
      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(mkdirSync).mockImplementation(() => undefined);
      vi.mocked(writeFileSync).mockImplementation(() => undefined);
      vi.mocked(statSync).mockReturnValue({ isFile: () => true } as Stats);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(parseYamlScript).mockReturnValue(
        mockYamlScript as MidsceneYamlScript,
      );

      let callCount = 0;
      vi.mocked(ScriptPlayer).mockImplementation(() => {
        const shouldFail = callCount === 0;
        callCount++;
        return createMockPlayer(!shouldFail);
      });

      const executor = new BatchRunner(configWithContinueOnError);

      const results = await executor.run();

      // Should stop after first failure
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Mock error');
      expect(results[1].success).toBe(true); // index mode with concurrent=2, even if the first fails, the second will be executed and succeed
      expect(results[0].executed).toBe(true);
      expect(results[1].executed).toBe(true);
      expect(results[2].executed).toBe(false);
    });
  });
});
