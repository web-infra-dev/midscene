import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { IndexYamlParser } from '@/index-parser';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Only mock readFileSync
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

describe('IndexYamlParser', () => {
  let parser: IndexYamlParser;
  const mockIndexYamlPath = '/test/index.yml';

  beforeEach(() => {
    vi.clearAllMocks();
    parser = new IndexYamlParser(mockIndexYamlPath);
  });

  test('constructor sets correct base path', () => {
    expect(parser).toBeDefined();
    expect((parser as any).basePath).toBe(resolve('/test'));
  });

  test('parse returns correct config for valid YAML', async () => {
    const mockYamlContent = `
order: 
  - "*.yml"
concurrent: 2
continueOnError: true
web:
  url: "http://example.com"
output:
  path: "/test/output"
  format: "json"
`;

    vi.mocked(readFileSync).mockReturnValue(mockYamlContent);

    const config = await parser.parse();

    expect(config.concurrent).toBe(2);
    expect(config.continueOnError).toBe(true);
    expect(config.web?.url).toBe('http://example.com');
    expect(config.outputPath).toBe('/test/output');
    expect(config.patterns).toEqual(['*.yml']);
  });

  test('parse uses default values when not specified', async () => {
    const mockYamlContent = `
order: 
  - "*.yml"
`;

    vi.mocked(readFileSync).mockReturnValue(mockYamlContent);

    const config = await parser.parse();

    expect(config.concurrent).toBe(1);
    expect(config.continueOnError).toBe(false);
  });

  test('buildExecutionConfig merges configurations correctly', () => {
    const fileConfig = {
      tasks: [{ name: 'file task', flow: [] }],
      web: { url: 'http://file.com' },
    };

    const globalConfig = {
      concurrent: 1,
      continueOnError: false,
      web: { url: 'http://global.com' },
      files: [],
      patterns: [],
    };

    const result = parser.buildExecutionConfig(
      fileConfig,
      globalConfig,
      '/test/output.json',
    );

    expect(result).toEqual({
      tasks: [{ name: 'file task', flow: [] }],
      web: {
        url: 'http://file.com',
        output: '/test/output.json',
      },
    });
  });

  test('buildExecutionConfig handles android config', () => {
    const fileConfig = {
      tasks: [{ name: 'android task', flow: [] }],
      android: { launch: 'com.test.app' },
    };

    const globalConfig = {
      concurrent: 1,
      continueOnError: false,
      android: { launch: 'com.global.app' },
      files: [],
      patterns: [],
    };

    const result = parser.buildExecutionConfig(
      fileConfig,
      globalConfig,
      '/test/output.json',
    );

    expect(result).toEqual({
      tasks: [{ name: 'android task', flow: [] }],
      android: {
        launch: 'com.test.app',
        output: '/test/output.json',
      },
    });
  });

  test('buildExecutionConfig handles target config (legacy)', () => {
    const fileConfig = {
      tasks: [{ name: 'target task', flow: [] }],
      target: { url: 'http://target.com' },
    };

    const globalConfig = {
      concurrent: 1,
      continueOnError: false,
      files: [],
      patterns: [],
    };

    const result = parser.buildExecutionConfig(
      fileConfig,
      globalConfig,
      '/test/output.json',
    );

    expect(result).toEqual({
      tasks: [{ name: 'target task', flow: [] }],
      web: {
        url: 'http://target.com',
        output: '/test/output.json',
      },
    });
  });

  test('generateOutputPath returns correct path with base directory', () => {
    const result = parser.generateOutputPath(
      '/path/to/script.yml',
      '/output/dir',
    );
    expect(result).toBe(join('/output/dir', 'script.json'));
  });

  test('generateOutputPath returns correct path without base directory', () => {
    const result = parser.generateOutputPath('/path/to/script.yaml');
    expect(result).toBe('script.json');
  });

  test('generateOutputPath handles complex file paths', () => {
    const result = parser.generateOutputPath(
      'C:\\Users\\test\\complex-script-name.yml',
      '/output',
    );
    expect(result).toBe(join('/output', 'complex-script-name.json'));
  });

  test('generateOutputPath handles file without extension', () => {
    const result = parser.generateOutputPath('/path/to/script', '/output');
    expect(result).toBe(join('/output', 'script.json'));
  });
});
