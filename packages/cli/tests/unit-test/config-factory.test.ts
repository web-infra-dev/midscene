import { readFileSync } from 'node:fs';
import {
  type ConfigFactoryOptions,
  createConfig,
  createFilesConfig,
  parseConfigYaml,
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
import merge from 'lodash.merge';

describe('config-factory', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseConfigYaml', () => {
    const mockIndexPath = '/test/index.yml';

    test('should parse valid config YAML with all options', async () => {
      const mockYamlContent = `
files:
  - "*.yml"
concurrent: 3
continueOnError: true
headed: true
keepWindow: true
dotenvOverride: true
dotenvDebug: false
web:
  url: "http://example.com"
  userAgent: "yaml-ua"
android:
  deviceId: "yaml-device"
summary: "yaml-summary.json"
`;
      const mockParsedYaml = {
        files: ['*.yml'],
        concurrent: 3,
        continueOnError: true,
        headed: true,
        keepWindow: true,
        dotenvOverride: true,
        dotenvDebug: false,
        web: { url: 'http://example.com', userAgent: 'yaml-ua' },
        android: { deviceId: 'yaml-device' },
        summary: 'yaml-summary.json',
      };

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      vi.mocked(matchYamlFiles).mockResolvedValue(['file1.yml']);

      const result = await parseConfigYaml(mockIndexPath);

      expect(result).toEqual({
        concurrent: 3,
        continueOnError: true,
        headed: true,
        keepWindow: true,
        dotenvOverride: true,
        dotenvDebug: false,
        web: { url: 'http://example.com', userAgent: 'yaml-ua' },
        android: { deviceId: 'yaml-device' },
        summary: 'yaml-summary.json',
        patterns: ['*.yml'],
        shareBrowserContext: false,
        files: ['file1.yml'],
      });
    });

    test('should use default values when options are not specified', async () => {
      const mockYamlContent = `files: ["*.yml"]`;
      const mockParsedYaml = { files: ['*.yml'] };

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      vi.mocked(matchYamlFiles).mockResolvedValue(['test.yml']);

      const result = await parseConfigYaml(mockIndexPath);

      expect(result.concurrent).toBe(1);
      expect(result.continueOnError).toBe(false);
      expect(result.headed).toBe(false);
      expect(result.keepWindow).toBe(false);
      expect(result.dotenvOverride).toBe(false);
      expect(result.dotenvDebug).toBe(false);
      expect(result.summary).toMatch(/index-\d+\.json$/);
    });

    test('should throw an error if "files" is not an array', async () => {
      const mockYamlContent = `files: "not-an-array"`;
      const mockParsedYaml = { files: 'not-an-array' };

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);

      await expect(parseConfigYaml(mockIndexPath)).rejects.toThrow(
        'Config YAML must contain a "files" array',
      );
    });

    test('should throw an error if no files are found', async () => {
      const mockYamlContent = `files: ["*.yml"]`;
      const mockParsedYaml = { files: ['*.yml'] };

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      vi.mocked(matchYamlFiles).mockResolvedValue([]); // No files found

      await expect(parseConfigYaml(mockIndexPath)).rejects.toThrow(
        'No YAML files found matching the patterns in "files"',
      );
    });
  });

  describe('createConfig', () => {
    test('should merge command-line options over config file options', async () => {
      const mockYamlContent = `
files:
  - file1.yml
concurrent: 2
`;
      const mockParsedYaml = {
        files: ['file1.yml'],
        concurrent: 2,
        continueOnError: false,
        headed: false,
        keepWindow: false,
        dotenvOverride: false,
        dotenvDebug: true,
        summary: 'parsed.json',
        shareBrowserContext: false,
        web: { userAgent: 'from-file', viewportWidth: 800 },
        android: { deviceId: 'from-file' },
      };
      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      vi.mocked(matchYamlFiles).mockResolvedValue(['file1.yml']);

      const cmdLineOptions: ConfigFactoryOptions = {
        concurrent: 5,
        headed: true,
        summary: 'from-cmd.json',
        web: { userAgent: 'from-cmd', viewportHeight: 900 },
        android: { deviceId: 'from-cmd' },
      };

      const result = await createConfig('/test/index.yml', cmdLineOptions);

      const expectedGlobalConfig = merge(
        {
          web: mockParsedYaml.web,
          android: mockParsedYaml.android,
        },
        {
          web: cmdLineOptions.web,
          android: cmdLineOptions.android,
        },
      );

      expect(result.concurrent).toBe(5);
      expect(result.headed).toBe(true);
      expect(result.summary).toBe('from-cmd.json');
      expect(result.globalConfig).toEqual(expectedGlobalConfig);
    });
  });

  describe('createFilesConfig', async () => {
    test('should create config with default options and expand patterns', async () => {
      const patterns = ['test1.yml', 'test*.yml'];
      const expandedFiles = ['test1.yml', 'testA.yml', 'testB.yml'];
      vi.mocked(matchYamlFiles).mockResolvedValue(expandedFiles);

      const result = await createFilesConfig(patterns);

      expect(result).toEqual({
        files: expandedFiles,
        concurrent: 1,
        continueOnError: false,
        shareBrowserContext: false,
        summary: expect.stringMatching(/summary-\d+\.json$/),
        headed: false,
        keepWindow: false,
        dotenvOverride: false,
        dotenvDebug: false,
        globalConfig: {
          web: undefined,
          android: undefined,
        },
      });
      expect(matchYamlFiles).toHaveBeenCalledWith(patterns[0], {
        cwd: process.cwd(),
      });
      expect(matchYamlFiles).toHaveBeenCalledWith(patterns[1], {
        cwd: process.cwd(),
      });
    });

    test('should create config with all custom options and expand patterns', async () => {
      const patterns = ['*.yml'];
      const expandedFiles = ['file1.yml', 'file2.yml'];
      vi.mocked(matchYamlFiles).mockResolvedValue(expandedFiles);

      const options: ConfigFactoryOptions = {
        concurrent: 3,
        continueOnError: true,
        summary: 'custom.json',
        shareBrowserContext: true,
        headed: true,
        keepWindow: true,
        dotenvOverride: true,
        dotenvDebug: false,
        web: { userAgent: 'custom-ua' },
        android: { deviceId: 'custom-device' },
      };
      const result = await createFilesConfig(patterns, options);

      expect(result).toEqual({
        files: expandedFiles,
        concurrent: 3,
        continueOnError: true,
        summary: 'custom.json',
        shareBrowserContext: true,
        headed: true,
        keepWindow: true,
        dotenvOverride: true,
        dotenvDebug: false,
        globalConfig: {
          web: { userAgent: 'custom-ua' },
          android: { deviceId: 'custom-device' },
        },
      });
      expect(matchYamlFiles).toHaveBeenCalledWith(patterns[0], {
        cwd: process.cwd(),
      });
    });
  });
});
