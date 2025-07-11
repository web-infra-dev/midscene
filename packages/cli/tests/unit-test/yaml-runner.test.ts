import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { IndexYamlParser } from '@/index-parser';
import { BatchYamlExecutor } from '@/yaml-runner';
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
vi.mock('@/index-parser');
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

// Mock the yaml script
const mockYamlScript = {
  tasks: [{ name: 'test task' }],
  web: { url: 'http://test.com' },
};

// Mock ScriptPlayer
const createMockPlayer = (success = true) => {
  const mockPlayer = {
    status: success ? 'done' : 'error',
    output: '/test/output/file.json',
    reportFile: '/test/report.html',
    result: { test: 'data' },
    errorInSetup: success ? null : new Error('Mock error'),
    taskStatusList: [],
    run: vi.fn().mockResolvedValue(undefined),
    script: mockYamlScript,
    setupAgent: vi.fn(),
    unnamedResultIndex: 0,
    pageAgent: null,
    currentTaskIndex: undefined,
    agentStatusTip: '',
  };
  return mockPlayer as any;
};

describe('BatchYamlExecutor', () => {
  let mockParser: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock IndexYamlParser
    mockParser = {
      parse: vi.fn().mockResolvedValue(mockIndexConfig),
      buildExecutionConfig: vi.fn().mockReturnValue(mockYamlScript),
      generateOutputPath: vi.fn().mockReturnValue('/test/output/file.json'),
    };
    (IndexYamlParser as any).mockImplementation(() => mockParser);

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
    test('constructor creates executor with index mode', () => {
      const executor = new BatchYamlExecutor('/test/index.yml', 'index');
      expect(executor).toBeDefined();
      expect(IndexYamlParser).toHaveBeenCalledWith('/test/index.yml');
    });

    test('constructor throws error with invalid arguments', () => {
      expect(() => {
        new BatchYamlExecutor(['file1.yml'] as any, 'index');
      }).toThrow('Invalid constructor arguments');
    });

    test('initialize parses config correctly', async () => {
      const executor = new BatchYamlExecutor('/test/index.yml', 'index');

      await executor.initialize();
      expect(mockParser.parse).toHaveBeenCalled();
    });

    test('execute throws error if not initialized', async () => {
      const executor = new BatchYamlExecutor('/test/index.yml', 'index');
      await expect(executor.execute()).rejects.toThrow();
    });

    test('execute runs files successfully with default options', async () => {
      const executor = new BatchYamlExecutor('/test/index.yml', 'index');
      await executor.initialize();

      const results = await executor.execute();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
    });

    test('execute handles concurrent execution', async () => {
      const executor = new BatchYamlExecutor('/test/index.yml', 'index');
      await executor.initialize();

      const results = await executor.execute({
        keepWindow: true,
        headed: true,
      });

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
    });
  });

  describe('Files mode', () => {
    test('constructor creates executor with files mode', () => {
      const files = ['file1.yml', 'file2.yml'];
      const executor = new BatchYamlExecutor(files, 'files');
      expect(executor).toBeDefined();
    });

    test('constructor throws error with invalid arguments for files mode', () => {
      expect(() => {
        new BatchYamlExecutor('/test/index.yml' as any, 'files');
      }).toThrow('Invalid constructor arguments');
    });

    test('initialize does nothing for files mode', async () => {
      const files = ['file1.yml', 'file2.yml'];
      const executor = new BatchYamlExecutor(files, 'files');

      await executor.initialize();

      // Should not call parser.parse for files mode
      expect(mockParser.parse).not.toHaveBeenCalled();
    });

    test('execute runs files successfully in files mode', async () => {
      const files = ['file1.yml', 'file2.yml'];
      const executor = new BatchYamlExecutor(files, 'files');
      await executor.initialize();

      const results = await executor.execute();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
    });
  });

  describe('Common functionality', () => {
    let executor: BatchYamlExecutor;

    beforeEach(async () => {
      executor = new BatchYamlExecutor('/test/index.yml', 'index');
      await executor.initialize();
    });

    test('getExecutionSummary returns correct summary', async () => {
      await executor.execute();

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

      await executor.execute();

      const failedFiles = executor.getFailedFiles();
      expect(failedFiles).toHaveLength(1);
    });

    test('getResults returns copy of results', async () => {
      await executor.execute();

      const results = executor.getResults();
      expect(results).toHaveLength(2);
    });

    test('printExecutionSummary prints and returns success status', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await executor.execute();
      const success = executor.printExecutionSummary();

      expect(success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('📊 Execution Summary:'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ All files executed successfully!'),
      );

      consoleSpy.mockRestore();
    });

    test('printExecutionSummary shows failed files when there are failures', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock a failed execution
      vi.mocked(ScriptPlayer).mockImplementationOnce(() => {
        return createMockPlayer(false);
      });

      await executor.execute();
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
        ...mockIndexConfig,
        continueOnError: true,
      };

      mockParser.parse.mockResolvedValue(configWithContinueOnError);

      const executor = new BatchYamlExecutor('/test/index.yml', 'index');
      await executor.initialize();

      // Mock one successful and one failed execution
      vi.mocked(ScriptPlayer)
        .mockImplementationOnce(() => {
          return createMockPlayer(true);
        })
        .mockImplementationOnce(() => {
          return createMockPlayer(false);
        });

      const results = await executor.execute();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    test('execute handles continueOnError=false', async () => {
      const configWithContinueOnError = {
        ...mockIndexConfig,
        continueOnError: false,
      };

      mockParser.parse.mockResolvedValue(configWithContinueOnError);

      const executor = new BatchYamlExecutor('/test/index.yml', 'index');
      await executor.initialize();

      // Mock first execution to fail
      vi.mocked(ScriptPlayer).mockImplementationOnce(() => {
        return createMockPlayer(false);
      });

      const results = await executor.execute();

      // Should stop after first failure
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });
  });
});
