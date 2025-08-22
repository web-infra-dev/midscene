import { readFileSync } from 'node:fs';
import { createYamlPlayer, launchServer } from '@/create-yaml-player';
import type { MidsceneYamlScript, MidsceneYamlScriptEnv } from '@midscene/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock dependencies
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('http-server', () => ({
  createServer: vi.fn(),
}));

vi.mock('@midscene/web/yaml', () => ({
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
import { createServer } from 'http-server';

describe('create-yaml-player', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('launchServer', () => {
    test('should launch HTTP server and resolve with server instance', async () => {
      const mockServer = {
        listen: vi.fn((port, host, callback) => {
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
    const mockFilePath = '/test/script.yml';

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
});
