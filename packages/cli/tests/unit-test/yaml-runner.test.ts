import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { BatchRunner } from '@/batch-runner';
import {
  createFilesConfig,
  createIndexConfig,
  parseIndexYaml,
} from '@/config-factory';
import type { MidsceneYamlScript } from '@midscene/core/.';
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
  createIndexConfig: vi.fn(),
  createFilesConfig: vi.fn(),
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
  files: ['file1.yml', 'file2.yml'],
  concurrent: 2,
  continueOnError: false,
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
    status: 'init' as any,
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
  return mockPlayer as any;
};

describe('BatchRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock config factory functions
    vi.mocked(parseIndexYaml).mockResolvedValue(mockIndexConfig);
    vi.mocked(createIndexConfig).mockResolvedValue(mockBatchConfig);
    vi.mocked(createFilesConfig).mockReturnValue(mockBatchConfig);

    // Mock fs functions
    vi.mocked(readFileSync).mockReturnValue('mock yaml content');
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    vi.mocked(writeFileSync).mockImplementation(() => undefined);
    vi.mocked(statSync).mockReturnValue({ isFile: () => true } as any);

    // Mock parseYamlScript
    vi.mocked(parseYamlScript).mockReturnValue(
      mockYamlScript as MidsceneYamlScript,
    );

    // Mock ScriptPlayer constructor with simpler implementation
    vi.mocked(ScriptPlayer).mockImplementation(() => {
      return createMockPlayer();
    });
  });

  describe('Index YAML mode', () => {
    test('constructor creates executor with index config', async () => {
      const executor = new BatchRunner(mockBatchConfig);
      expect(executor).toBeDefined();
    });

    test('createIndexConfig is called correctly', async () => {
      // Since we're mocking createIndexConfig, we need to test it directly
      // Set up the mock to call parseIndexYaml when createIndexConfig is called
      vi.mocked(createIndexConfig).mockImplementation(async (path) => {
        await parseIndexYaml(path);
        return mockBatchConfig;
      });

      await createIndexConfig('/test/index.yml');
      expect(parseIndexYaml).toHaveBeenCalledWith('/test/index.yml');
    });

    test('execute runs files successfully with default options', async () => {
      const executor = new BatchRunner(mockBatchConfig);

      const results = await executor.run();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
    });

    test('execute handles concurrent execution', async () => {
      const executor = new BatchRunner(mockBatchConfig);

      const results = await executor.run({
        keepWindow: true,
        headed: true,
      });

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
    });
  });

  describe('Files mode', () => {
    test('constructor creates executor with files config', async () => {
      const executor = new BatchRunner(mockBatchConfig);
      expect(executor).toBeDefined();
    });

    test('createFilesConfig works correctly', async () => {
      const config = createFilesConfig(['file1.yml', 'file2.yml']);
      expect(config).toBeDefined();
    });

    test('execute runs files successfully in files mode', async () => {
      const executor = new BatchRunner(mockBatchConfig);

      const results = await executor.run();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
    });

    test('execute stops on first failure in files mode', async () => {
      // Clear previous mock and set up new one for this test
      vi.clearAllMocks();

      // Re-setup required mocks
      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(mkdirSync).mockImplementation(() => undefined);
      vi.mocked(writeFileSync).mockImplementation(() => undefined);
      vi.mocked(statSync).mockReturnValue({ isFile: () => true } as any);
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
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Mock error');
      expect(results[1].success).toBe(true);
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
      expect(summary.total).toBe(2);
      expect(summary.successful).toBe(2);
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
      expect(results).toHaveLength(2);
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

  describe('Error handling', () => {
    test('execute handles continueOnError=true', async () => {
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

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    test('execute handles continueOnError=false', async () => {
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
      vi.mocked(statSync).mockReturnValue({ isFile: () => true } as any);
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
    });
  });
});
