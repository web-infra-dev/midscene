import { readFileSync } from 'node:fs';
import { createYamlPlayer, launchServer } from '@/create-yaml-player';
import type { MidsceneYamlScript, MidsceneYamlScriptEnv } from '@midscene/core';
import { processCacheConfig } from '@midscene/core/utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the global config manager to control environment variables
vi.mock('@midscene/shared/env', () => ({
  MIDSCENE_CACHE: 'MIDSCENE_CACHE',
  globalConfigManager: {
    getEnvConfigInBoolean: vi.fn(),
  },
}));

// Mock dependencies
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('http-server', () => ({
  createServer: vi.fn(),
}));

vi.mock('@midscene/core/yaml', () => ({
  ScriptPlayer: vi.fn(),
  parseYamlScript: vi.fn(),
}));

vi.mock('@midscene/android', () => ({
  agentFromAdbDevice: vi.fn(),
}));

vi.mock('@midscene/web/bridge-mode', () => ({
  AgentOverChromeBridge: vi.fn(),
}));

vi.mock('@midscene/web/puppeteer-agent-launcher', () => ({
  puppeteerAgentForTarget: vi.fn(),
}));

import { ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { globalConfigManager } from '@midscene/shared/env';
import { createServer } from 'http-server';

describe('create-yaml-player', () => {
  const mockFilePath = '/test/script.yml';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('launchServer', () => {
    test('should launch HTTP server and resolve with server instance', async () => {
      const mockServer = {
        listen: vi.fn((_port, _host, callback) => {
          // Simulate async server start
          setTimeout(() => callback(), 0);
        }),
        server: {
          address: vi.fn().mockReturnValue({
            address: '127.0.0.1',
            port: 8080,
          }),
          close: vi.fn(),
        },
      };

      vi.mocked(createServer).mockReturnValue(mockServer);

      const result = await launchServer('/test/dir');

      expect(createServer).toHaveBeenCalledWith({
        root: '/test/dir',
      });
      expect(mockServer.listen).toHaveBeenCalledWith(
        0,
        '127.0.0.1',
        expect.any(Function),
      );
      expect(result).toBe(mockServer);
    });
  });

  describe('createYamlPlayer', () => {
    test('should create player with web target', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
        },
        tasks: [],
      };

      const mockPlayer = { addCleanup: vi.fn() };

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(ScriptPlayer).mockImplementation(
        () => mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>,
      );

      const result = await createYamlPlayer(mockFilePath);

      expect(parseYamlScript).toHaveBeenCalledWith(
        'mock yaml content',
        mockFilePath,
      );
      expect(ScriptPlayer).toHaveBeenCalledWith(
        mockScript,
        expect.any(Function),
        undefined,
        mockFilePath,
      );
      expect(result).toBe(mockPlayer);
    });

    test('should create player with bridge mode configuration', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          bridgeMode: 'newTabWithUrl',
        },
        tasks: [],
      };

      const mockPlayer = { addCleanup: vi.fn() };

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(ScriptPlayer).mockImplementation(
        () => mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>,
      );

      const result = await createYamlPlayer(mockFilePath, mockScript);

      expect(result).toBe(mockPlayer);
      expect(ScriptPlayer).toHaveBeenCalledWith(
        mockScript,
        expect.any(Function),
        undefined,
        mockFilePath,
      );
    });

    test('should create player with android target', async () => {
      const mockScript: MidsceneYamlScript = {
        android: {
          deviceId: 'test-device',
        },
        tasks: [],
      };

      const mockPlayer = { addCleanup: vi.fn() };

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(ScriptPlayer).mockImplementation(
        () => mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>,
      );

      const result = await createYamlPlayer(mockFilePath, mockScript);

      expect(result).toBe(mockPlayer);
      expect(ScriptPlayer).toHaveBeenCalledWith(
        mockScript,
        expect.any(Function),
        undefined,
        mockFilePath,
      );
    });

    test('should handle script parsing correctly', async () => {
      const mockScript: MidsceneYamlScript = {
        web: { url: 'http://example.com' },
        tasks: [],
      };

      const mockPlayer = { addCleanup: vi.fn() };

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(ScriptPlayer).mockImplementation(
        () => mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>,
      );

      const result = await createYamlPlayer(mockFilePath, mockScript);

      expect(parseYamlScript).not.toHaveBeenCalled(); // Script is provided, so parsing should be skipped
      expect(result).toBe(mockPlayer);
    });

    test('should parse YAML when script is not provided', async () => {
      const mockScript: MidsceneYamlScript = {
        web: { url: 'http://example.com' },
        tasks: [],
      };

      const mockPlayer = { addCleanup: vi.fn() };

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(ScriptPlayer).mockImplementation(
        () => mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>,
      );

      const result = await createYamlPlayer(mockFilePath); // No script provided

      expect(parseYamlScript).toHaveBeenCalledWith(
        'mock yaml content',
        mockFilePath,
      );
      expect(result).toBe(mockPlayer);
    });

    test('should handle custom options', async () => {
      const mockScript: MidsceneYamlScript = {
        web: { url: 'http://example.com' },
        tasks: [],
      };

      const mockPlayer = { addCleanup: vi.fn() };

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(ScriptPlayer).mockImplementation(
        () => mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>,
      );

      const options = {
        headed: true,
        keepWindow: true,
      };

      const result = await createYamlPlayer(mockFilePath, mockScript, options);

      expect(result).toBe(mockPlayer);
    });
  });

  describe('Cache configuration - Legacy compatibility mode', () => {
    test('should enable cache when MIDSCENE_CACHE env var is true (legacy mode)', () => {
      // Mock environment variable to enable legacy cache mode
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        true,
      );

      // Process cache config as create-yaml-player would do internally
      // When agent.cache is undefined, it should check the environment variable
      const fileName = 'my-test-script';
      const result = processCacheConfig(undefined, fileName);

      // Verify that environment variable was checked
      expect(globalConfigManager.getEnvConfigInBoolean).toHaveBeenCalledWith(
        'MIDSCENE_CACHE',
      );

      // Verify that cache is enabled with the file name as ID
      expect(result).toEqual({
        id: fileName,
      });
    });

    test('should not enable cache when MIDSCENE_CACHE env var is false (legacy mode)', () => {
      // Mock environment variable to disable legacy cache mode
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        false,
      );

      // Process cache config as create-yaml-player would do internally
      const fileName = 'my-test-script';
      const result = processCacheConfig(undefined, fileName);

      // Verify that environment variable was checked
      expect(globalConfigManager.getEnvConfigInBoolean).toHaveBeenCalledWith(
        'MIDSCENE_CACHE',
      );

      // Verify that cache is disabled (undefined)
      expect(result).toBeUndefined();
    });

    test('should prefer explicit cache config over legacy mode', () => {
      // Mock environment variable to enable legacy cache mode
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        true,
      );

      // Process cache config with explicit cache configuration
      const fileName = 'my-test-script';
      const explicitCache = {
        id: 'explicit-cache-id',
        strategy: 'read-only' as const,
      };
      const result = processCacheConfig(explicitCache, fileName);

      // Verify that environment variable was NOT checked (new config takes precedence)
      expect(globalConfigManager.getEnvConfigInBoolean).not.toHaveBeenCalled();

      // Verify that explicit cache config is used
      expect(result).toEqual({
        id: 'explicit-cache-id',
        strategy: 'read-only',
      });
    });

    test('should use fileName as cache ID when cache is true', () => {
      // When cache is explicitly set to true in YAML script
      const fileName = 'my-test-script';
      const result = processCacheConfig(true, fileName);

      // Environment variable should not be checked for explicit cache: true
      expect(globalConfigManager.getEnvConfigInBoolean).not.toHaveBeenCalled();

      // Verify that fileName is used as the cache ID
      expect(result).toEqual({
        id: fileName,
      });
    });

    test('should use fileName as fallback when cache object has no ID', () => {
      // When cache object is provided but without an ID
      const fileName = 'my-test-script';
      const cacheConfig = { strategy: 'write-only' as const };
      const result = processCacheConfig(cacheConfig as any, fileName);

      // Environment variable should not be checked for explicit cache object
      expect(globalConfigManager.getEnvConfigInBoolean).not.toHaveBeenCalled();

      // Verify that fileName is used as fallback ID
      expect(result).toEqual({
        id: fileName,
        strategy: 'write-only',
      });
    });

    test('should disable cache when cache is explicitly false', () => {
      // When cache is explicitly set to false in YAML script
      const fileName = 'my-test-script';
      const result = processCacheConfig(false, fileName);

      // Environment variable should not be checked for explicit cache: false
      expect(globalConfigManager.getEnvConfigInBoolean).not.toHaveBeenCalled();

      // Verify that cache is disabled
      expect(result).toBeUndefined();
    });
  });
});
