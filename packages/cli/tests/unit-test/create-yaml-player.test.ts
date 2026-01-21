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

vi.mock('@midscene/ios', () => ({
  agentFromWebDriverAgent: vi.fn(),
}));

vi.mock('@midscene/web/bridge-mode', () => ({
  AgentOverChromeBridge: vi.fn(),
}));

vi.mock('@midscene/web/puppeteer-agent-launcher', () => ({
  puppeteerAgentForTarget: vi.fn(),
}));

import { agentFromAdbDevice } from '@midscene/android';
import { ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { agentFromWebDriverAgent } from '@midscene/ios';
import { globalConfigManager } from '@midscene/shared/env';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { puppeteerAgentForTarget } from '@midscene/web/puppeteer-agent-launcher';
import { createServer } from 'http-server';

/**
 * Test helper: Gets the arguments from a specific mock function call.
 * @param mockFn - The mocked function
 * @param callIndex - Index of the call (default: 0 for first call)
 * @param argIndex - Index of the argument (default: 0 for first argument)
 * @returns The argument value at the specified indices
 */
function getMockCallArg<T>(mockFn: any, callIndex = 0, argIndex = 0): T {
  return mockFn.mock.calls[callIndex][argIndex];
}

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

  describe('Device Options Propagation', () => {
    test('should pass all Android device options from YAML to agentFromAdbDevice', async () => {
      const mockAndroidOptions = {
        deviceId: 'emulator-5554',
        androidAdbPath: '/custom/path/to/adb',
        remoteAdbHost: '192.168.1.100',
        remoteAdbPort: 5037,
        imeStrategy: 'yadb-for-non-ascii' as const,
        displayId: 1,
        usePhysicalDisplayIdForScreenshot: true,
        usePhysicalDisplayIdForDisplayLookup: true,
        screenshotResizeScale: 0.5,
        alwaysRefreshScreenInfo: true,
        autoDismissKeyboard: true,
        keyboardDismissStrategy: 'esc-first' as const,
        launch: 'com.example.app',
      };

      const mockScript: MidsceneYamlScript = {
        android: mockAndroidOptions,
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn(), launch: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        // Capture the setup function to call it later
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function that was passed to ScriptPlayer
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify agentFromAdbDevice was called with deviceId and all options
      expect(agentFromAdbDevice).toHaveBeenCalledWith(
        mockAndroidOptions.deviceId,
        expect.objectContaining({
          androidAdbPath: mockAndroidOptions.androidAdbPath,
          remoteAdbHost: mockAndroidOptions.remoteAdbHost,
          remoteAdbPort: mockAndroidOptions.remoteAdbPort,
          imeStrategy: mockAndroidOptions.imeStrategy,
          displayId: mockAndroidOptions.displayId,
          usePhysicalDisplayIdForScreenshot:
            mockAndroidOptions.usePhysicalDisplayIdForScreenshot,
          usePhysicalDisplayIdForDisplayLookup:
            mockAndroidOptions.usePhysicalDisplayIdForDisplayLookup,
          screenshotResizeScale: mockAndroidOptions.screenshotResizeScale,
          alwaysRefreshScreenInfo: mockAndroidOptions.alwaysRefreshScreenInfo,
          autoDismissKeyboard: mockAndroidOptions.autoDismissKeyboard,
          keyboardDismissStrategy: mockAndroidOptions.keyboardDismissStrategy,
          launch: mockAndroidOptions.launch,
        }),
      );
    });

    test('should pass all iOS device options from YAML to agentFromWebDriverAgent', async () => {
      const mockIOSOptions = {
        deviceId: '00008110-000123456789ABCD',
        wdaPort: 8100,
        wdaHost: '192.168.1.100',
        useWDA: true,
        autoDismissKeyboard: true,
        launch: 'com.example.app',
      };

      const mockScript: MidsceneYamlScript = {
        ios: mockIOSOptions,
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn(), launch: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function that was passed to ScriptPlayer
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify agentFromWebDriverAgent was called with all options
      expect(agentFromWebDriverAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: mockIOSOptions.deviceId,
          wdaPort: mockIOSOptions.wdaPort,
          wdaHost: mockIOSOptions.wdaHost,
          useWDA: mockIOSOptions.useWDA,
          autoDismissKeyboard: mockIOSOptions.autoDismissKeyboard,
          launch: mockIOSOptions.launch,
        }),
      );
    });

    test('should handle Android config with minimal options', async () => {
      const mockScript: MidsceneYamlScript = {
        android: {
          deviceId: 'test-device',
        },
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn(), launch: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify basic call structure
      expect(agentFromAdbDevice).toHaveBeenCalledWith(
        'test-device',
        expect.objectContaining({
          deviceId: 'test-device',
        }),
      );
    });

    test('should handle iOS config with minimal options', async () => {
      const mockScript: MidsceneYamlScript = {
        ios: {},
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn(), launch: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify basic call
      expect(agentFromWebDriverAgent).toHaveBeenCalled();
    });
  });

  describe('aiActionContext Propagation', () => {
    test('should pass aiActionContext from agent config to Android agent', async () => {
      const mockScript: MidsceneYamlScript = {
        android: {
          deviceId: 'test-device',
        },
        agent: {
          aiActionContext: 'This is a test context for Android',
        },
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn(), launch: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify aiActionContext was passed to Android agent
      expect(agentFromAdbDevice).toHaveBeenCalledWith(
        'test-device',
        expect.objectContaining({
          aiActionContext: 'This is a test context for Android',
        }),
      );
    });

    test('should pass aiActionContext from agent config to iOS agent', async () => {
      const mockScript: MidsceneYamlScript = {
        ios: {
          deviceId: 'test-ios-device',
        },
        agent: {
          aiActionContext: 'This is a test context for iOS',
        },
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn(), launch: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify aiActionContext was passed to iOS agent
      expect(agentFromWebDriverAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          aiActionContext: 'This is a test context for iOS',
        }),
      );
    });

    test('should pass aiActionContext from agent config to bridge mode agent', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          bridgeMode: 'newTabWithUrl',
        },
        agent: {
          aiActionContext: 'This is a test context for bridge mode',
        },
        tasks: [],
      };

      const mockAgent = {
        destroy: vi.fn(),
        connectNewTabWithUrl: vi.fn(),
      };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);

      // Mock AgentOverChromeBridge from the bridge-mode module
      const { AgentOverChromeBridge } = await import(
        '@midscene/web/bridge-mode'
      );
      vi.mocked(AgentOverChromeBridge).mockImplementation(
        (opts) => mockAgent as any,
      );

      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify aiActionContext was passed to bridge mode agent
      expect(AgentOverChromeBridge).toHaveBeenCalledWith(
        expect.objectContaining({
          aiActionContext: 'This is a test context for bridge mode',
        }),
      );
    });

    test('should handle undefined aiActionContext gracefully for Android', async () => {
      const mockScript: MidsceneYamlScript = {
        android: {
          deviceId: 'test-device',
        },
        // No agent config provided
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn(), launch: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify that when agent config is undefined, testId is still set from fileName
      // and aiActionContext is not present (undefined fields are not spread)
      const callArgs = getMockCallArg(vi.mocked(agentFromAdbDevice), 0, 1);
      expect(callArgs).toMatchObject({
        testId: 'script',
        deviceId: 'test-device',
      });
      expect(callArgs).not.toHaveProperty('aiActionContext');
    });

    test('should handle undefined aiActionContext gracefully for iOS', async () => {
      const mockScript: MidsceneYamlScript = {
        ios: {},
        // No agent config provided
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn(), launch: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify that when agent config is undefined, testId is still set from fileName
      // and aiActionContext is not present (undefined fields are not spread)
      const callArgs = getMockCallArg(vi.mocked(agentFromWebDriverAgent), 0, 0);
      expect(callArgs).toMatchObject({
        testId: 'script',
      });
      expect(callArgs).not.toHaveProperty('aiActionContext');
    });
  });

  describe('Extended Agent Options Propagation', () => {
    test('should pass all new agent options from YAML to Puppeteer agent', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          serve: './test',
          url: 'test.html',
        },
        agent: {
          testId: 'custom-test-id',
          groupName: 'Custom Group',
          groupDescription: 'Custom description',
          generateReport: true,
          autoPrintReportMsg: false,
          reportFileName: 'custom-report',
          replanningCycleLimit: 25,
          aiActionContext: 'Test context',
          cache: { id: 'test-cache', strategy: 'read-write' },
        },
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify all agent options were passed
      // Note: YAML testId takes precedence over fileName
      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          groupName: 'Custom Group',
          groupDescription: 'Custom description',
          generateReport: true,
          autoPrintReportMsg: false,
          reportFileName: 'custom-report',
          replanningCycleLimit: 25,
          aiActionContext: 'Test context',
          testId: 'custom-test-id', // YAML testId is used
        }),
        undefined, // browser
        undefined, // page
      );
    });

    test('should pass extended agent options to Android agent', async () => {
      const mockScript: MidsceneYamlScript = {
        android: {
          deviceId: 'test-device',
        },
        agent: {
          groupName: 'Android Test',
          generateReport: false,
          replanningCycleLimit: 30,
        },
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn(), launch: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      if (setupFnCallback) {
        await setupFnCallback();
      }

      expect(agentFromAdbDevice).toHaveBeenCalledWith(
        'test-device',
        expect.objectContaining({
          groupName: 'Android Test',
          generateReport: false,
          replanningCycleLimit: 30,
        }),
      );
    });

    test('should pass extended agent options to iOS agent', async () => {
      const mockScript: MidsceneYamlScript = {
        ios: {},
        agent: {
          reportFileName: 'ios-test-report',
          autoPrintReportMsg: true,
        },
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn(), launch: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      if (setupFnCallback) {
        await setupFnCallback();
      }

      expect(agentFromWebDriverAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          reportFileName: 'ios-test-report',
          autoPrintReportMsg: true,
        }),
      );
    });

    test('should pass extended agent options to bridge mode agent', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          bridgeMode: 'currentTab',
        },
        agent: {
          groupDescription: 'Bridge test',
          replanningCycleLimit: 40,
        },
        tasks: [],
      };

      const mockAgent = {
        destroy: vi.fn(),
        connectCurrentTab: vi.fn().mockResolvedValue(undefined),
      };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(AgentOverChromeBridge).mockImplementation(
        (opts) => mockAgent as any,
      );
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      if (setupFnCallback) {
        await setupFnCallback();
      }

      expect(AgentOverChromeBridge).toHaveBeenCalledWith(
        expect.objectContaining({
          groupDescription: 'Bridge test',
          replanningCycleLimit: 40,
        }),
      );
    });

    test('should prioritize CLI preference testId over YAML testId', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          serve: './test',
          url: 'test.html',
        },
        agent: {
          testId: 'yaml-test-id',
        },
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript, {
        testId: 'cli-test-id',
      });

      if (setupFnCallback) {
        await setupFnCallback();
      }

      // CLI testId should take priority
      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          testId: 'cli-test-id',
        }),
        undefined, // browser
        undefined, // page
      );
    });

    test('should use YAML testId when no preference testId exists', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          serve: './test',
          url: 'test.html',
        },
        agent: {
          testId: 'yaml-test-id',
        },
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      if (setupFnCallback) {
        await setupFnCallback();
      }

      // When no explicit CLI testId is provided, YAML testId takes precedence over fileName
      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          testId: 'yaml-test-id',
        }),
        undefined, // browser
        undefined, // page
      );
    });

    test('should handle undefined agent config gracefully', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          serve: './test',
          url: 'test.html',
        },
        // No agent config provided
        tasks: [],
      };

      const mockAgent = { destroy: vi.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      vi.mocked(readFileSync).mockReturnValue('mock yaml content');
      vi.mocked(parseYamlScript).mockReturnValue(mockScript);
      vi.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      vi.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: vi.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Should not throw and should call with default values
      expect(puppeteerAgentForTarget).toHaveBeenCalled();
    });
  });
});
