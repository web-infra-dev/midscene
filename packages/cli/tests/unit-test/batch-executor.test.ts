import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BatchYamlExecutor } from '@/batch-executor';
import { IndexYamlParser } from '@/index-parser';
import { playYamlFiles } from '@/yaml-runner';
import type {
  MidsceneYamlScript,
  MidsceneYamlScriptEnv,
} from '@midscene/core/.';
import { parseYamlScript } from '@midscene/web/yaml';
import type { ScriptPlayer } from '@midscene/web/yaml';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock all dependencies
vi.mock('node:fs');
vi.mock('puppeteer');
vi.mock('@/index-parser');
vi.mock('@/yaml-runner');
vi.mock('@midscene/web/yaml');

// Mock the parsed config
const mockConfig = {
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

describe('BatchYamlExecutor', () => {
  let executor: BatchYamlExecutor;
  let mockParser: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock IndexYamlParser
    mockParser = {
      parse: vi.fn().mockResolvedValue(mockConfig),
      buildExecutionConfig: vi.fn().mockReturnValue(mockYamlScript),
      generateOutputPath: vi.fn().mockReturnValue('/test/output/file.json'),
    };
    (IndexYamlParser as any).mockImplementation(() => mockParser);

    // Mock fs functions
    vi.mocked(readFileSync).mockReturnValue('mock yaml content');
    vi.mocked(mkdirSync).mockReturnValue(undefined);
    vi.mocked(writeFileSync).mockReturnValue(undefined);

    // Mock parseYamlScript
    vi.mocked(parseYamlScript).mockReturnValue(
      mockYamlScript as MidsceneYamlScript,
    );

    // Mock playYamlFiles - return results for each file
    vi.mocked(playYamlFiles).mockImplementation(async (files) => ({
      success: true,
      files: files.map((f) => ({
        file: typeof f === 'string' ? f : f.file,
        success: true,
        player: {
          reportFile: '/test/report.html',
          output: '/test/output/file.json',
          result: { test: 'data' },
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>,
      })),
    }));

    executor = new BatchYamlExecutor('/test/index.yml');
  });

  test('constructor creates executor with correct batch output directory', () => {
    expect(executor).toBeDefined();
    expect(IndexYamlParser).toHaveBeenCalledWith('/test/index.yml');
  });

  test('initialize parses config and updates batchOutputDir correctly', async () => {
    // Test with no output specified - should keep original batchOutputDir
    await executor.initialize();
    expect(mockParser.parse).toHaveBeenCalled();

    // biome-ignore lint/complexity/useLiteralKeys: <explanation>
    const originalBatchOutputDir = executor['batchOutputDir'];
    expect(originalBatchOutputDir).toMatch(/index-\d+$/);

    // Test with web.output specified - should update batchOutputDir
    const configWithWebOutput = {
      ...mockConfig,
      web: {
        ...mockConfig.web,
        output: '/custom/output/dir/result.json',
      },
    };

    // Create new mock parser for this test case
    const mockParser2 = {
      parse: vi.fn().mockResolvedValue(configWithWebOutput),
      buildExecutionConfig: vi.fn().mockReturnValue(mockYamlScript),
      generateOutputPath: vi.fn().mockReturnValue('/test/output/file.json'),
    };
    (IndexYamlParser as any).mockImplementationOnce(() => mockParser2);

    const executor2 = new BatchYamlExecutor('/test/index.yml');
    await executor2.initialize();

    // biome-ignore lint/complexity/useLiteralKeys: <explanation>
    expect(executor2['batchOutputDir']).toBe('/custom/output/dir');

    // Test with android.output specified - should update batchOutputDir
    const configWithAndroidOutput = {
      ...mockConfig,
      web: undefined, // Clear web output to test android fallback
      android: { launch: 'com.test.app', output: '/android/output/test.json' },
    };

    const mockParser3 = {
      parse: vi.fn().mockResolvedValue(configWithAndroidOutput),
      buildExecutionConfig: vi.fn().mockReturnValue(mockYamlScript),
      generateOutputPath: vi.fn().mockReturnValue('/test/output/file.json'),
    };
    (IndexYamlParser as any).mockImplementationOnce(() => mockParser3);

    const executor3 = new BatchYamlExecutor('/test/index.yml');
    await executor3.initialize();

    // biome-ignore lint/complexity/useLiteralKeys: <explanation>
    expect(executor3['batchOutputDir']).toBe('/android/output');

    // Test with target.output specified but no web/android output
    // dirname('') returns '.' so batchOutputDir becomes '.'
    const configWithTargetOutput = {
      ...mockConfig,
      web: undefined,
      android: undefined,
      target: { url: 'http://test.com', output: '/target/output/file.json' },
    };

    const mockParser4 = {
      parse: vi.fn().mockResolvedValue(configWithTargetOutput),
      buildExecutionConfig: vi.fn().mockReturnValue(mockYamlScript),
      generateOutputPath: vi.fn().mockReturnValue('/test/output/file.json'),
    };
    (IndexYamlParser as any).mockImplementationOnce(() => mockParser4);

    const executor4 = new BatchYamlExecutor('/test/index.yml');
    await executor4.initialize();

    // Since only target.output is present, the dirname of empty string is '.'
    // biome-ignore lint/complexity/useLiteralKeys: <explanation>
    expect(executor4['batchOutputDir']).toBe('.');
  });

  test('execute throws error if not initialized', async () => {
    await expect(executor.execute()).rejects.toThrow();
  });

  test('execute runs files successfully with default options', async () => {
    await executor.initialize();
    const results = await executor.execute();

    expect(results).toHaveLength(2);
    expect(playYamlFiles).toHaveBeenCalledTimes(2);
    expect(results[0].success).toBe(true);
  });

  test('execute handles concurrent execution', async () => {
    await executor.initialize();
    const results = await executor.execute({ keepWindow: true, headed: true });

    expect(results).toHaveLength(2);
    expect(playYamlFiles).toHaveBeenCalledTimes(2);
    // Check that each call includes the options
    expect(playYamlFiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          file: expect.any(String),
          script: expect.any(Object),
        }),
      ]),
      expect.objectContaining({
        keepWindow: true,
        headed: true,
      }),
    );
  });

  test('execute handles continueOnError=true', async () => {
    mockConfig.continueOnError = true;
    vi.mocked(playYamlFiles).mockResolvedValueOnce({
      success: false,
      files: [],
    });

    await executor.initialize();
    const results = await executor.execute();

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
  });

  test('execute handles continueOnError=false', async () => {
    mockConfig.continueOnError = false;
    vi.mocked(playYamlFiles).mockResolvedValueOnce({
      success: false,
      files: [],
    });

    await executor.initialize();
    const results = await executor.execute();

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
  });

  test('getExecutionSummary returns correct summary', async () => {
    await executor.initialize();
    await executor.execute();

    const summary = executor.getExecutionSummary();
    expect(summary.total).toBe(2);
    expect(summary.successful).toBe(2);
    expect(summary.failed).toBe(0);
    expect(typeof summary.totalDuration).toBe('number');
  });

  test('getFailedFiles returns failed files', async () => {
    vi.mocked(playYamlFiles).mockResolvedValueOnce({
      success: false,
      files: [],
    });

    await executor.initialize();
    await executor.execute();

    const failedFiles = executor.getFailedFiles();
    expect(failedFiles).toContain('file1.yml');
  });

  test('getResults returns copy of results', async () => {
    await executor.initialize();
    await executor.execute();

    const results = executor.getResults();
    expect(results).toHaveLength(2);
    // biome-ignore lint/complexity/useLiteralKeys: <explanation>
    expect(results).not.toBe(executor['results']); // Should be a copy
  });

  test('loadFileConfig extracts correct fields', async () => {
    const fullConfig = {
      tasks: [{ name: 'test', flow: [] }],
      web: { url: 'index.html', serve: './tests/server_root' },
      android: { launch: 'com.test.app' },
      other: 'should be ignored',
    };

    vi.mocked(parseYamlScript).mockReturnValue(fullConfig);

    await executor.initialize();
    // biome-ignore lint/complexity/useLiteralKeys: <explanation>
    const config = await executor['loadFileConfig']('test.yml');

    expect(config.tasks).toEqual([{ name: 'test', flow: [] }]);
    expect(config.web).toEqual({
      url: 'index.html',
      serve: './tests/server_root',
    });
    expect(config.android).toEqual({ launch: 'com.test.app' });
    expect(config).not.toHaveProperty('other');
  });

  test('generateFileOutputPath creates directory and returns path', async () => {
    await executor.initialize();
    // biome-ignore lint/complexity/useLiteralKeys: <explanation>
    const path = executor['generateFileOutputPath']('test.yml');

    expect(mkdirSync).toHaveBeenCalled();
    expect(mockParser.generateOutputPath).toHaveBeenCalledWith(
      'test.yml',
      expect.any(String),
    );
    expect(path).toBe('/test/output/file.json');
  });

  test('formatOutputPath returns relative path', async () => {
    await executor.initialize();
    // biome-ignore lint/complexity/useLiteralKeys: <explanation>
    const formatted = executor['formatOutputPath'](
      '/test/batch-output/file.json',
    );

    expect(formatted).toMatch(/^\.\/.*file\.json$/);
  });
});
