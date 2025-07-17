import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type ConfigFactoryOptions,
  type ParsedIndexConfig,
  createFilesConfig,
  createIndexConfig,
  parseIndexYaml,
} from '@/config-factory';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock dependencies
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('@/cli-utils', () => ({
  matchYamlFiles: vi.fn(),
}));

vi.mock('@midscene/web/yaml', () => ({
  interpolateEnvVars: vi.fn((content) => content),
}));

vi.mock('js-yaml', () => ({
  load: vi.fn(),
}));

import { matchYamlFiles } from '@/cli-utils';
import { interpolateEnvVars } from '@midscene/web/yaml';
import { load as yamlLoad } from 'js-yaml';

describe('config-factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseIndexYaml', () => {
    const mockIndexPath = '/test/index.yml';

    test('should parse valid index YAML with all options', async () => {
      const mockYamlContent = `
order: 
  - "*.yml"
  - "test/*.yaml"
concurrent: 3
continueOnError: true
web:
  url: "http://example.com"
  serve: "./static"
android:
  deviceId: "test-device"
output:
  path: "/test/output"
`;

      const mockParsedYaml = {
        order: ['*.yml', 'test/*.yaml'],
        concurrent: 3,
        continueOnError: true,
        web: {
          url: 'http://example.com',
          serve: './static',
        },
        android: {
          deviceId: 'test-device',
        },
        output: {
          path: '/test/output',
        },
      };

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      vi.mocked(matchYamlFiles).mockResolvedValue(['file1.yml', 'file2.yaml']);

      const result = await parseIndexYaml(mockIndexPath);

      expect(result).toEqual({
        concurrent: 3,
        continueOnError: true,
        web: {
          url: 'http://example.com',
          serve: './static',
        },
        android: {
          deviceId: 'test-device',
        },
        patterns: ['*.yml', 'test/*.yaml'],
        shareBrowserContext: false,
        summary: expect.stringMatching(/index-\d+\.json$/),
        files: ['file1.yml', 'file2.yaml'],
      });

      expect(readFileSync).toHaveBeenCalledWith(mockIndexPath, 'utf8');
      expect(interpolateEnvVars).toHaveBeenCalledWith(mockYamlContent);
      expect(yamlLoad).toHaveBeenCalledWith(mockYamlContent);
      expect(matchYamlFiles).toHaveBeenCalledWith('*.yml', {
        cwd: resolve('/test'),
      });
      expect(matchYamlFiles).toHaveBeenCalledWith('test/*.yaml', {
        cwd: resolve('/test'),
      });
    });

    test('should use default values when options are not specified', async () => {
      const mockYamlContent = `
order: 
  - "*.yml"
`;

      const mockParsedYaml = {
        order: ['*.yml'],
      };

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      vi.mocked(matchYamlFiles).mockResolvedValue(['test.yml']);

      const result = await parseIndexYaml(mockIndexPath);

      expect(result.concurrent).toBe(1);
      expect(result.continueOnError).toBe(false);
      expect(result.web).toBeUndefined();
      expect(result.android).toBeUndefined();
      expect(result.summary).toMatch(/index-\d+\.json$/);
      expect(result.shareBrowserContext).toBe(false);
    });

    test('should handle file expansion with duplicates', async () => {
      const mockYamlContent = `
order: 
  - "*.yml"
  - "test.yml"
`;

      const mockParsedYaml = {
        order: ['*.yml', 'test.yml'],
      };

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);

      // Mock matchYamlFiles to return overlapping files
      vi.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['test.yml', 'other.yml'])
        .mockResolvedValueOnce(['test.yml']); // duplicate

      const result = await parseIndexYaml(mockIndexPath);

      expect(result.files).toEqual(['test.yml', 'other.yml']);
    });

    test('should throw error when YAML parsing fails', async () => {
      const mockYamlContent = 'invalid: yaml: content:';

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockImplementation(() => {
        throw new Error('Invalid YAML');
      });

      await expect(parseIndexYaml(mockIndexPath)).rejects.toThrow(
        'Failed to parse index YAML: Error: Invalid YAML',
      );
    });

    test('should throw error when order is missing', async () => {
      const mockYamlContent = `
concurrent: 2
`;

      const mockParsedYaml = {
        concurrent: 2,
      };

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);

      await expect(parseIndexYaml(mockIndexPath)).rejects.toThrow(
        'patterns is not iterable',
      );
    });

    test('should return config with empty files when no files are found', async () => {
      const mockYamlContent = `
order: 
  - "nonexistent/*.yml"
`;

      const mockParsedYaml = {
        order: ['nonexistent/*.yml'],
      };

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      vi.mocked(matchYamlFiles).mockResolvedValue([]);

      const result = await parseIndexYaml(mockIndexPath);

      expect(result.files).toEqual([]);
      expect(result.patterns).toEqual(['nonexistent/*.yml']);
    });

    test('should handle file expansion errors gracefully', async () => {
      const mockYamlContent = `
order: 
  - "valid/*.yml"
  - "invalid/*.yml"
`;

      const mockParsedYaml = {
        order: ['valid/*.yml', 'invalid/*.yml'],
      };

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      vi.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['valid.yml'])
        .mockRejectedValueOnce(new Error('Permission denied'));

      const result = await parseIndexYaml(mockIndexPath);

      expect(result.files).toEqual(['valid.yml']);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Warning: Failed to expand pattern "invalid/*.yml":',
        expect.any(Error),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('createIndexConfig', () => {
    test('should create BatchRunnerConfig from parsed index config', async () => {
      vi.mocked(readFileSync).mockReturnValue('mock content');
      vi.mocked(interpolateEnvVars).mockReturnValue('mock content');
      vi.mocked(yamlLoad).mockReturnValue({
        order: ['*.yml'],
        concurrent: 2,
        continueOnError: true,
        web: { url: 'http://example.com' },
        android: { deviceId: 'test-device' },
        output: { path: '/test/output' },
      });
      vi.mocked(matchYamlFiles).mockResolvedValue(['test1.yml', 'test2.yml']);

      const result = await createIndexConfig('/test/my-index.yml');

      expect(result).toEqual({
        files: ['test1.yml', 'test2.yml'],
        concurrent: 2,
        continueOnError: true,
        shareBrowserContext: false,
        summary: expect.stringMatching(/my-index-\d+\.json$/),
        globalConfig: {
          web: { url: 'http://example.com' },
          android: { deviceId: 'test-device' },
          target: undefined,
        },
      });
    });
  });

  describe('createFilesConfig', () => {
    test('should create BatchRunnerConfig with default options', () => {
      const files = ['test1.yml', 'test2.yml'];
      const result = createFilesConfig(files);

      expect(result).toEqual({
        files,
        concurrent: 1,
        continueOnError: false,
        shareBrowserContext: false,
        summary: expect.stringMatching(/summary-\d+\.json$/),
      });
    });

    test('should create BatchRunnerConfig with custom options', () => {
      const files = ['test1.yml', 'test2.yml'];
      const options: ConfigFactoryOptions = {
        concurrent: 3,
        continueOnError: true,
      };
      const result = createFilesConfig(files, options);

      expect(result).toEqual({
        files,
        concurrent: 3,
        continueOnError: true,
        shareBrowserContext: false,
        summary: expect.stringMatching(/summary-\d+\.json$/),
      });
    });

    test('should handle empty options object', () => {
      const files = ['test.yml'];
      const result = createFilesConfig(files, {});

      expect(result).toEqual({
        files,
        concurrent: 1,
        continueOnError: false,
        shareBrowserContext: false,
        summary: expect.stringMatching(/summary-\d+\.json$/),
      });
    });

    test('should handle undefined options', () => {
      const files = ['test.yml'];
      const result = createFilesConfig(files);

      expect(result).toEqual({
        files,
        concurrent: 1,
        continueOnError: false,
        shareBrowserContext: false,
        summary: expect.stringMatching(/summary-\d+\.json$/),
      });
    });
  });
});
