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

vi.mock('@midscene/core/yaml', () => ({
  interpolateEnvVars: vi.fn((content) => content),
}));

vi.mock('js-yaml', () => ({
  load: vi.fn(),
}));

import { matchYamlFiles } from '@/cli-utils';
import { interpolateEnvVars } from '@midscene/core/yaml';
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

    test('should preserve duplicate file entries', async () => {
      const mockYamlContent = `
files:
  - "login.yml"
  - "test.yml"
  - "login.yml"
`;
      const mockParsedYaml = {
        files: ['login.yml', 'test.yml', 'login.yml'],
      };

      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      vi.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['login.yml'])
        .mockResolvedValueOnce(['test.yml'])
        .mockResolvedValueOnce(['login.yml']);

      const result = await parseConfigYaml(mockIndexPath);

      expect(result.files).toEqual(['login.yml', 'test.yml', 'login.yml']);
      expect(result.files.length).toBe(3);
    });
  });

  describe('createConfig', () => {
    test('should automatically enable headed when keepWindow is true', async () => {
      const mockYamlContent = `
files:
  - file1.yml
keepWindow: true
headed: false
`;
      const mockParsedYaml = {
        files: ['file1.yml'],
        concurrent: 1,
        continueOnError: false,
        headed: false,
        keepWindow: true,
        dotenvOverride: false,
        dotenvDebug: false,
        summary: 'parsed.json',
        shareBrowserContext: false,
      };
      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      vi.mocked(matchYamlFiles).mockResolvedValue(['file1.yml']);

      // Test 1: keepWindow from config file should enable headed
      const result1 = await createConfig('/test/index.yml');
      expect(result1.keepWindow).toBe(true);
      expect(result1.headed).toBe(true);

      // Test 2: keepWindow from command line should enable headed
      const result2 = await createConfig('/test/index.yml', {
        keepWindow: true,
        headed: false,
      });
      expect(result2.keepWindow).toBe(true);
      expect(result2.headed).toBe(true);

      // Test 3: keepWindow false should not affect headed
      const result3 = await createConfig('/test/index.yml', {
        keepWindow: false,
        headed: true,
      });
      expect(result3.keepWindow).toBe(false);
      expect(result3.headed).toBe(true);
    });

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

    test('should override config files with command-line files parameter', async () => {
      const mockYamlContent = `
files:
  - config-file1.yml
  - config-file2.yml
concurrent: 2
`;
      const mockParsedYaml = {
        files: ['config-file1.yml', 'config-file2.yml'],
        concurrent: 2,
        continueOnError: false,
        headed: false,
        keepWindow: false,
        dotenvOverride: false,
        dotenvDebug: false,
        summary: 'parsed.json',
        shareBrowserContext: false,
      };
      vi.mocked(readFileSync).mockReturnValue(mockYamlContent);
      vi.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      // Calls for parseConfigYaml - one for each pattern in config file
      vi.mocked(matchYamlFiles).mockResolvedValueOnce(['config-file1.yml']);
      vi.mocked(matchYamlFiles).mockResolvedValueOnce(['config-file2.yml']);
      // Call for command-line files override
      vi.mocked(matchYamlFiles).mockResolvedValueOnce(['cmd-file.yml']);

      const cmdLineOptions: ConfigFactoryOptions = {
        files: ['cmd-file.yml'],
      };

      const result = await createConfig('/test/index.yml', cmdLineOptions);

      // Command line files should override config files
      expect(result.files).toEqual(['cmd-file.yml']);
      // Other config values should still come from the config file
      expect(result.concurrent).toBe(2);
    });
  });

  describe('createFilesConfig', async () => {
    test('should automatically enable headed when keepWindow is true', async () => {
      const patterns = ['test.yml'];
      const expandedFiles = ['test.yml'];
      vi.mocked(matchYamlFiles).mockResolvedValue(expandedFiles);

      // Test 1: keepWindow true should enable headed
      const result1 = await createFilesConfig(patterns, {
        keepWindow: true,
        headed: false,
      });
      expect(result1.keepWindow).toBe(true);
      expect(result1.headed).toBe(true);

      // Test 2: keepWindow true with headed undefined should enable headed
      const result2 = await createFilesConfig(patterns, {
        keepWindow: true,
      });
      expect(result2.keepWindow).toBe(true);
      expect(result2.headed).toBe(true);

      // Test 3: keepWindow false should not affect headed true
      const result3 = await createFilesConfig(patterns, {
        keepWindow: false,
        headed: true,
      });
      expect(result3.keepWindow).toBe(false);
      expect(result3.headed).toBe(true);

      // Test 4: Both false should remain false
      const result4 = await createFilesConfig(patterns, {
        keepWindow: false,
        headed: false,
      });
      expect(result4.keepWindow).toBe(false);
      expect(result4.headed).toBe(false);
    });

    test('should create config with default options and expand patterns', async () => {
      const patterns = ['test1.yml', 'test*.yml'];
      const expandedFiles = ['test1.yml', 'testA.yml', 'testB.yml'];
      // Mock to return different results for each pattern call
      vi.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['test1.yml'])
        .mockResolvedValueOnce(['test1.yml', 'testA.yml', 'testB.yml']);

      const result = await createFilesConfig(patterns);

      // Note: test1.yml appears twice because it's matched by both patterns
      // This is expected behavior - patterns are evaluated independently
      expect(result).toEqual({
        files: ['test1.yml', 'test1.yml', 'testA.yml', 'testB.yml'],
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
          ios: undefined,
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
