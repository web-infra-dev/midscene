import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { IndexYamlParser } from '@/index-parser';
import { YamlRunner } from '@/yaml-runner';
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
      const executor = new YamlRunner('/test/index.yml', 'index');
      expect(executor).toBeDefined();
      expect(IndexYamlParser).toHaveBeenCalledWith('/test/index.yml');
    });

    test('constructor throws error with invalid arguments', () => {
      expect(() => {
        new YamlRunner(['file1.yml'] as any, 'index');
      }).toThrow('Invalid constructor arguments');
    });

    test('initialize parses config correctly', async () => {
      const executor = new YamlRunner('/test/index.yml', 'index');

      await executor.initialize();
      expect(mockParser.parse).toHaveBeenCalled();
    });

    test('execute throws error if not initialized', async () => {
      const executor = new YamlRunner('/test/index.yml', 'index');
      await expect(executor.run()).rejects.toThrow();
    });

    test('execute runs files successfully with default options', async () => {
      const executor = new YamlRunner('/test/index.yml', 'index');
      await executor.initialize();

      const results = await executor.run();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
    });

    test('execute handles concurrent execution', async () => {
      const executor = new YamlRunner('/test/index.yml', 'index');
      await executor.initialize();

      const results = await executor.run({
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
      const executor = new YamlRunner(files, 'files');
      expect(executor).toBeDefined();
    });

    test('constructor throws error with invalid arguments for files mode', () => {
      expect(() => {
        new YamlRunner('/test/index.yml' as any, 'files');
      }).toThrow('Invalid constructor arguments');
    });

    test('initialize does nothing for files mode', async () => {
      const files = ['file1.yml', 'file2.yml'];
      const executor = new YamlRunner(files, 'files');

      await executor.initialize();

      // Should not call parser.parse for files mode
      expect(mockParser.parse).not.toHaveBeenCalled();
    });

    test('execute runs files successfully in files mode', async () => {
      const files = ['file1.yml', 'file2.yml'];
      const executor = new YamlRunner(files, 'files');
      await executor.initialize();

      const results = await executor.run();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
    });

    test('execute stops on first failure in files mode', async () => {
      const files = ['file1.yml', 'file2.yml'];

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
        const shouldFail = callCount === 0; // first call should fail
        callCount++;
        return createMockPlayer(!shouldFail);
      });

      const executor = new YamlRunner(files, 'files');
      await executor.initialize();

      const results = await executor.run();

      // Should stop after first failure in files mode
      expect(results.filter((r) => !r.success)).toHaveLength(2);
      expect(results[0].error).toBe('Mock error');
      expect(results[1].error).toBe('Not executed (previous task failed)');

      // Check summary reflects the stopped execution
      const summary = executor.getExecutionSummary();
      expect(summary.failed).toBe(1);
      expect(summary.notExecuted).toBe(1);
    });
  });

  describe('Common functionality', () => {
    let executor: YamlRunner;

    beforeEach(async () => {
      executor = new YamlRunner('/test/index.yml', 'index');
      await executor.initialize();
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
        ...mockIndexConfig,
        continueOnError: true,
      };

      mockParser.parse.mockResolvedValue(configWithContinueOnError);

      const executor = new YamlRunner('/test/index.yml', 'index');
      await executor.initialize();

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
        ...mockIndexConfig,
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

      // Setup parser mock
      mockParser.parse.mockResolvedValue(configWithContinueOnError);
      mockParser.buildExecutionConfig.mockReturnValue(mockYamlScript);
      mockParser.generateOutputPath.mockReturnValue('/test/output/file.json');
      (IndexYamlParser as any).mockImplementation(() => mockParser);

      let callCount = 0;
      vi.mocked(ScriptPlayer).mockImplementation(() => {
        const shouldFail = callCount === 0;
        callCount++;
        return createMockPlayer(!shouldFail);
      });

      const executor = new YamlRunner('/test/index.yml', 'index');
      await executor.initialize();

      const results = await executor.run();

      // Should stop after first failure
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Mock error');
      expect(results[1].success).toBe(true); // index mode with concurrent=2, even if the first fails, the second will be executed and succeed
    });
  });
});
