import { readFileSync } from 'node:fs';
import {
  type ConfigFactoryOptions,
  createConfig,
  createFilesConfig,
  parseConfigYaml,
} from '@/config-factory';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';

// Mock dependencies
rs.mock('node:fs', () => ({
  readFileSync: rs.fn(),
}));

rs.mock('@/cli-utils', () => ({
  matchYamlFiles: rs.fn(),
}));

rs.mock('@midscene/core/yaml', () => ({
  interpolateEnvVars: rs.fn((content) => content),
  resolveWebTarget: rs.fn((config) => {
    const sources = ['page', 'browser', 'web', 'target'] as const;
    const entries = sources
      .map((source) => [source, config[source]] as const)
      .filter(([, value]) => typeof value !== 'undefined');

    if (entries.length === 0) {
      return undefined;
    }

    if (entries.length > 1) {
      throw new Error('Only one web target can be specified');
    }

    const [source, target] = entries[0];
    const mode =
      source === 'page'
        ? 'page'
        : source === 'browser'
          ? 'browser'
          : (target.mode ?? 'page');

    return {
      source,
      mode,
      target: {
        ...target,
        mode,
      },
    };
  }),
}));

rs.mock('js-yaml', () => ({
  load: rs.fn(),
}));

import { matchYamlFiles } from '@/cli-utils';
import { interpolateEnvVars } from '@midscene/core/yaml';
import { load as yamlLoad } from 'js-yaml';
import merge from 'lodash.merge';

describe('config-factory', () => {
  beforeEach(() => {
    rs.restoreAllMocks();
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
        page: undefined,
        browser: undefined,
        web: { url: 'http://example.com', userAgent: 'yaml-ua' },
        target: undefined,
        android: { deviceId: 'yaml-device' },
        summary: 'yaml-summary.json',
      };

      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles).mockResolvedValue(['file1.yml']);

      const result = await parseConfigYaml(mockIndexPath);

      expect(result).toEqual({
        concurrent: 3,
        continueOnError: true,
        retry: 0,
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
        setup: undefined,
      });
    });

    test('should use default values when options are not specified', async () => {
      const mockYamlContent = `files: ["*.yml"]`;
      const mockParsedYaml = { files: ['*.yml'] };

      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles).mockResolvedValue(['test.yml']);

      const result = await parseConfigYaml(mockIndexPath);

      expect(result.concurrent).toBe(1);
      expect(result.continueOnError).toBe(false);
      expect(result.retry).toBe(0);
      expect(result.headed).toBe(false);
      expect(result.keepWindow).toBe(false);
      expect(result.dotenvOverride).toBe(false);
      expect(result.dotenvDebug).toBe(false);
      expect(result.summary).toMatch(/index-\d+\.json$/);
    });

    test('should parse the retry option from the config YAML', async () => {
      const mockYamlContent = `files: ["*.yml"]\nretry: 2`;
      const mockParsedYaml = { files: ['*.yml'], retry: 2 };

      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles).mockResolvedValue(['test.yml']);

      const result = await parseConfigYaml(mockIndexPath);

      expect(result.retry).toBe(2);
    });

    test('should throw an error if "files" is not an array', async () => {
      const mockYamlContent = `files: "not-an-array"`;
      const mockParsedYaml = { files: 'not-an-array' };

      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);

      await expect(parseConfigYaml(mockIndexPath)).rejects.toThrow(
        'Config YAML must contain a "files" array',
      );
    });

    test('should throw an error if no files are found', async () => {
      const mockYamlContent = `files: ["*.yml"]`;
      const mockParsedYaml = { files: ['*.yml'] };

      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles).mockResolvedValue([]); // No files found

      await expect(parseConfigYaml(mockIndexPath)).rejects.toThrow(
        'No YAML files found matching the patterns in "files"',
      );
    });

    test('should resolve the setup file ahead of the main files', async () => {
      const mockYamlContent = `
setup: "login.yml"
files:
  - "*.yml"
`;
      const mockParsedYaml = {
        setup: 'login.yml',
        files: ['*.yml'],
      };

      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      // First call expands `files`, second call resolves `setup`
      rs.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['search.yml'])
        .mockResolvedValueOnce(['login.yml']);

      const result = await parseConfigYaml(mockIndexPath);

      expect(result.files).toEqual(['search.yml']);
      expect(result.setup).toBe('login.yml');
    });

    test('should leave setup undefined when absent', async () => {
      const mockYamlContent = `files: ["*.yml"]`;
      const mockParsedYaml = { files: ['*.yml'] };

      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles).mockResolvedValue(['test.yml']);

      const result = await parseConfigYaml(mockIndexPath);

      expect(result.setup).toBeUndefined();
    });

    test('should throw when the setup pattern matches nothing', async () => {
      const mockYamlContent = `
setup: "login.yml"
files:
  - "*.yml"
`;
      const mockParsedYaml = {
        setup: 'login.yml',
        files: ['*.yml'],
      };

      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['search.yml']) // files
        .mockResolvedValueOnce([]); // setup matches nothing

      await expect(parseConfigYaml(mockIndexPath)).rejects.toThrow(
        'No YAML file found matching "setup"',
      );
    });

    test('should throw when the setup pattern matches multiple files', async () => {
      const mockYamlContent = `
setup: "setup-*.yml"
files:
  - "*.yml"
`;
      const mockParsedYaml = {
        setup: 'setup-*.yml',
        files: ['*.yml'],
      };

      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['search.yml']) // files
        .mockResolvedValueOnce(['setup-a.yml', 'setup-b.yml']); // setup matches >1

      await expect(parseConfigYaml(mockIndexPath)).rejects.toThrow(
        'must reference a single YAML file',
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

      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(interpolateEnvVars).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles)
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
      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles).mockResolvedValue(['file1.yml']);

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
        page: undefined,
        browser: undefined,
        web: { userAgent: 'from-file', viewportWidth: 800 },
        target: undefined,
        android: { deviceId: 'from-file' },
        ios: undefined,
      };
      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles).mockResolvedValue(['file1.yml']);

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
          page: mockParsedYaml.page,
          browser: mockParsedYaml.browser,
          web: mockParsedYaml.web,
          android: mockParsedYaml.android,
          ios: mockParsedYaml.ios,
          target: mockParsedYaml.target,
        },
        {
          page: cmdLineOptions.page,
          browser: cmdLineOptions.browser,
          web: cmdLineOptions.web,
          android: cmdLineOptions.android,
          ios: cmdLineOptions.ios,
          target: cmdLineOptions.target,
        },
      );

      expect(result.concurrent).toBe(5);
      expect(result.headed).toBe(true);
      expect(result.summary).toBe('from-cmd.json');
      expect(result.globalConfig).toEqual(expectedGlobalConfig);
    });

    test('should keep setup when shareBrowserContext is enabled', async () => {
      const mockYamlContent = `
setup: login.yml
files:
  - search.yml
shareBrowserContext: true
`;
      const mockParsedYaml = {
        setup: 'login.yml',
        files: ['search.yml'],
        shareBrowserContext: true,
      };
      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['search.yml']) // files
        .mockResolvedValueOnce(['login.yml']); // setup

      const result = await createConfig('/test/index.yml');

      expect(result.shareBrowserContext).toBe(true);
      expect(result.setup).toBe('login.yml');
      expect(result.files).toEqual(['search.yml']);
    });

    test('should reject setup without shareBrowserContext', async () => {
      const mockYamlContent = `
setup: login.yml
files:
  - search.yml
`;
      const mockParsedYaml = {
        setup: 'login.yml',
        files: ['search.yml'],
      };
      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      rs.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['search.yml']) // files
        .mockResolvedValueOnce(['login.yml']); // setup

      await expect(createConfig('/test/index.yml')).rejects.toThrow(
        'setup requires shareBrowserContext: true',
      );
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
      rs.mocked(readFileSync).mockReturnValue(mockYamlContent);
      rs.mocked(yamlLoad).mockReturnValue(mockParsedYaml);
      // Calls for parseConfigYaml - one for each pattern in config file
      rs.mocked(matchYamlFiles).mockResolvedValueOnce(['config-file1.yml']);
      rs.mocked(matchYamlFiles).mockResolvedValueOnce(['config-file2.yml']);
      // Call for command-line files override
      rs.mocked(matchYamlFiles).mockResolvedValueOnce(['cmd-file.yml']);

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
      rs.mocked(matchYamlFiles).mockResolvedValue(expandedFiles);

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
      rs.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['test1.yml'])
        .mockResolvedValueOnce(['test1.yml', 'testA.yml', 'testB.yml']);

      const result = await createFilesConfig(patterns);

      // Note: test1.yml appears twice because it's matched by both patterns
      // This is expected behavior - patterns are evaluated independently
      expect(result).toEqual({
        files: ['test1.yml', 'test1.yml', 'testA.yml', 'testB.yml'],
        setup: undefined,
        concurrent: 1,
        continueOnError: false,
        retry: 0,
        shareBrowserContext: false,
        summary: expect.stringMatching(/summary-\d+\.json$/),
        headed: false,
        keepWindow: false,
        dotenvOverride: false,
        dotenvDebug: false,
        globalConfig: {
          page: undefined,
          browser: undefined,
          web: undefined,
          target: undefined,
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

    test('should resolve setup when shareBrowserContext is enabled', async () => {
      const patterns = ['search.yml'];
      rs.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['search.yml']) // files
        .mockResolvedValueOnce(['login.yml']); // setup

      const result = await createFilesConfig(patterns, {
        shareBrowserContext: true,
        setup: 'login.yml',
      });

      expect(result.setup).toBe('login.yml');
      expect(result.files).toEqual(['search.yml']);
    });

    test('should reject setup without shareBrowserContext', async () => {
      const patterns = ['search.yml'];
      rs.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['search.yml']) // files
        .mockResolvedValueOnce(['login.yml']); // setup

      await expect(
        createFilesConfig(patterns, { setup: 'login.yml' }),
      ).rejects.toThrow('setup requires shareBrowserContext: true');
    });

    test('should forward the retry option through createFilesConfig', async () => {
      const patterns = ['*.yml'];
      rs.mocked(matchYamlFiles).mockResolvedValue(['file1.yml']);

      const result = await createFilesConfig(patterns, { retry: 3 });

      expect(result.retry).toBe(3);
    });

    test('should create config with all custom options and expand patterns', async () => {
      const patterns = ['*.yml'];
      const expandedFiles = ['file1.yml', 'file2.yml'];
      rs.mocked(matchYamlFiles).mockResolvedValue(expandedFiles);

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
        setup: undefined,
        concurrent: 3,
        continueOnError: true,
        retry: 0,
        summary: 'custom.json',
        shareBrowserContext: true,
        headed: true,
        keepWindow: true,
        dotenvOverride: true,
        dotenvDebug: false,
        globalConfig: {
          page: undefined,
          browser: undefined,
          web: { userAgent: 'custom-ua' },
          target: undefined,
          android: { deviceId: 'custom-device' },
          ios: undefined,
        },
      });
      expect(matchYamlFiles).toHaveBeenCalledWith(patterns[0], {
        cwd: process.cwd(),
      });
    });

    test('should create config for the documented YAML runner config-file example', async () => {
      const patterns = [
        './scripts/search-iphone.yaml',
        './scripts/search-laptop.yaml',
        './scripts/search-headphones.yaml',
        './scripts/search-camera.yaml',
      ];
      rs.mocked(matchYamlFiles)
        .mockResolvedValueOnce(['./scripts/search-iphone.yaml'])
        .mockResolvedValueOnce(['./scripts/search-laptop.yaml'])
        .mockResolvedValueOnce(['./scripts/search-headphones.yaml'])
        .mockResolvedValueOnce(['./scripts/search-camera.yaml']);

      const result = await createFilesConfig(patterns, {
        concurrent: 4,
        continueOnError: true,
        shareBrowserContext: true,
        summary: 'doc-summary.json',
        web: {
          userAgent: 'Doc Agent',
          viewportWidth: 1440,
          viewportHeight: 900,
        },
        android: {
          deviceId: 'android-doc-device',
        },
        ios: {
          wdaPort: 8100,
          wdaHost: '127.0.0.1',
        },
      });

      expect(result).toEqual({
        files: patterns,
        setup: undefined,
        concurrent: 4,
        continueOnError: true,
        retry: 0,
        shareBrowserContext: true,
        summary: 'doc-summary.json',
        headed: false,
        keepWindow: false,
        dotenvOverride: false,
        dotenvDebug: false,
        globalConfig: {
          page: undefined,
          browser: undefined,
          web: {
            userAgent: 'Doc Agent',
            viewportWidth: 1440,
            viewportHeight: 900,
          },
          target: undefined,
          android: {
            deviceId: 'android-doc-device',
          },
          ios: {
            wdaPort: 8100,
            wdaHost: '127.0.0.1',
          },
        },
      });
    });
  });
});
