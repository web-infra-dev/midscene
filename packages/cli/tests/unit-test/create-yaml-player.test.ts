import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createYamlPlayer, launchServer } from '@/create-yaml-player';
import type { MidsceneYamlScript, MidsceneYamlScriptEnv } from '@midscene/core';
import * as coreAgentActual from '@midscene/core/agent' with {
  rstest: 'importActual',
};
import * as coreYamlActual from '@midscene/core/yaml' with {
  rstest: 'importActual',
};
import * as sharedEnvActual from '@midscene/shared/env' with {
  rstest: 'importActual',
};
import * as puppeteerAgentLauncherActual from '@midscene/web/puppeteer-agent-launcher' with {
  rstest: 'importActual',
};
import { beforeEach, describe, expect, rs, test } from '@rstest/core';

// Mock the global config manager to control environment variables
rs.mock('@midscene/shared/env', () => ({
  ...sharedEnvActual,
  MIDSCENE_CACHE: 'MIDSCENE_CACHE',
  globalConfigManager: {
    getEnvConfigInBoolean: rs.fn(),
  },
}));

// Mock dependencies
rs.mock('node:fs', () => ({
  readFileSync: rs.fn(),
}));

rs.mock('http-server', () => ({
  createServer: rs.fn(),
}));

rs.mock('@midscene/core/yaml', () => ({
  ...coreYamlActual,
  ScriptPlayer: rs.fn(),
  parseYamlScript: rs.fn(),
}));

rs.mock('@midscene/core/agent', () => ({
  ...coreAgentActual,
  createAgent: rs.fn(),
  getReportFileName: rs.fn((tag: string) => `${tag}-mock-report`),
}));

rs.mock('@midscene/android', () => ({
  agentFromAdbDevice: rs.fn(),
}));

rs.mock('@midscene/ios', () => ({
  agentFromWebDriverAgent: rs.fn(),
}));

rs.mock('@midscene/harmony', () => ({
  agentFromHdcDevice: rs.fn(),
}));

rs.mock('@midscene/web/bridge-mode', () => ({
  AgentOverChromeBridge: rs.fn(),
}));

rs.mock('@midscene/web/puppeteer-agent-launcher', () => ({
  ...puppeteerAgentLauncherActual,
  buildDownloadBehavior: (downloadPath: string | undefined) =>
    downloadPath
      ? {
          policy: 'allow',
          downloadPath: downloadPath.startsWith('/')
            ? downloadPath
            : `${process.cwd()}/${downloadPath.replace(/^\.\//, '')}`,
        }
      : undefined,
  puppeteerAgentForTarget: rs.fn(),
}));

rs.mock('@midscene/web/puppeteer', () => ({
  PuppeteerAgent: rs.fn(),
}));

rs.mock('puppeteer', () => ({
  default: {
    connect: rs.fn(),
    launch: rs.fn(),
  },
}));

import { agentFromAdbDevice } from '@midscene/android';
import { getReportFileName } from '@midscene/core/agent';
import { ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { agentFromHdcDevice } from '@midscene/harmony';
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
    rs.clearAllMocks();
  });

  describe('launchServer', () => {
    test('should launch HTTP server and resolve with server instance', async () => {
      const mockServer = {
        listen: rs.fn((_port, _host, callback) => {
          // Simulate async server start
          setTimeout(() => callback(), 0);
        }),
        server: {
          address: rs.fn().mockReturnValue({
            address: '127.0.0.1',
            port: 8080,
          }),
          close: rs.fn(),
        },
      };

      rs.mocked(createServer).mockReturnValue(mockServer);

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

      const mockPlayer = { addCleanup: rs.fn() };

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(ScriptPlayer).mockImplementation(
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

    test('should pass explicit page target to puppeteer launcher', async () => {
      const mockScript: MidsceneYamlScript = {
        page: {
          url: 'http://example.com',
        },
        tasks: [],
      };
      const mockAgent = { destroy: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);
      await setupFnCallback?.();

      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'page',
          url: 'http://example.com',
        }),
        expect.any(Object),
        undefined,
        undefined,
      );
    });

    test('should pass explicit browser target to puppeteer launcher', async () => {
      const mockScript: MidsceneYamlScript = {
        browser: {
          url: 'http://example.com',
          autoFollowNewPage: true,
        },
        tasks: [],
      };
      const mockAgent = { destroy: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);
      await setupFnCallback?.();

      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'browser',
          url: 'http://example.com',
          autoFollowNewPage: true,
        }),
        expect.any(Object),
        undefined,
        undefined,
      );
    });

    test('should reject conflicting web targets during setup', async () => {
      const mockScript: MidsceneYamlScript = {
        page: {
          url: 'http://example.com/page',
        },
        browser: {
          url: 'http://example.com/browser',
        },
        tasks: [],
      };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      expect(setupFnCallback).toBeDefined();
      await expect(setupFnCallback!()).rejects.toThrow(
        'Only one web target can be specified',
      );
    });

    test('should create player with bridge mode configuration', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          bridgeMode: 'newTabWithUrl',
        },
        tasks: [],
      };

      const mockPlayer = { addCleanup: rs.fn() };

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(ScriptPlayer).mockImplementation(
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

      const mockPlayer = { addCleanup: rs.fn() };

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(ScriptPlayer).mockImplementation(
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

      const mockPlayer = { addCleanup: rs.fn() };

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(ScriptPlayer).mockImplementation(
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

      const mockPlayer = { addCleanup: rs.fn() };

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(ScriptPlayer).mockImplementation(
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

      const mockPlayer = { addCleanup: rs.fn() };

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(ScriptPlayer).mockImplementation(
        () => mockPlayer as unknown as ScriptPlayer<MidsceneYamlScriptEnv>,
      );

      const options = {
        headed: true,
        keepWindow: true,
      };

      const result = await createYamlPlayer(mockFilePath, mockScript, options);

      expect(result).toBe(mockPlayer);
    });

    test('should pass web downloadPath to puppeteer agent launcher', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          downloadPath: './downloads',
        },
        tasks: [],
      };
      const mockAgent = { destroy: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);
      await setupFnCallback?.();

      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://example.com',
          downloadPath: './downloads',
        }),
        expect.any(Object),
        undefined,
        undefined,
      );
    });
  });

  describe('Cache configuration - Legacy compatibility mode', () => {
    // `processCacheConfig` reads the mocked `globalConfigManager`, but it does so
    // through `@midscene/core/utils`. The `with { rstest: 'importActual' }` imports
    // at the top of this file eagerly evaluate their targets' real module graph
    // before the hoisted `rs.mock` calls register, so `@midscene/core/utils` gets
    // permanently bound to the *real* `@midscene/shared/env`: the mock never routes,
    // `getEnvConfigInBoolean` records zero calls, and every assertion here passes
    // vacuously (web-infra-dev/rstest#1581). Evicting the module and re-importing it
    // once the mock is registered rebinds it to the mocked env.
    //
    // Do not import `processCacheConfig` statically in this file — that binding is
    // the poisoned one. Do not reach for `rs.resetModules()` either: it evicts every
    // mocked module too, re-running each factory into fresh `rs.fn()`s that the
    // static imports above no longer point at.
    type CoreUtils = typeof import('@midscene/core/utils');
    let processCacheConfig: CoreUtils['processCacheConfig'];

    beforeEach(async () => {
      rs.doUnmock('@midscene/core/utils');
      ({ processCacheConfig } = await import('@midscene/core/utils'));
    });

    test('should enable cache when MIDSCENE_CACHE env var is true (legacy mode)', () => {
      // Mock environment variable to enable legacy cache mode
      rs.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
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
      rs.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
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
      rs.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
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

    test('should preserve explicit cache false', () => {
      // When cache is explicitly set to false in YAML script
      const fileName = 'my-test-script';
      const result = processCacheConfig(false, fileName);

      // Environment variable should not be checked for explicit cache: false
      expect(globalConfigManager.getEnvConfigInBoolean).not.toHaveBeenCalled();

      // Verify that explicit disablement survives the first normalization layer.
      expect(result).toBe(false);
    });

    test('should pass explicit cache false to the web agent', async () => {
      const mockScript: MidsceneYamlScript = {
        web: { url: 'http://example.com' },
        agent: {
          cache: false,
        },
        tasks: [],
      };
      const mockAgent = { destroy: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);
      await setupFnCallback?.();

      // `createYamlPlayer` was imported before this describe's `doUnmock`, so the
      // `processCacheConfig` it calls stays bound to the real env and never
      // touches the mocked `globalConfigManager`. Asserting on that mock's call
      // count here would be vacuous, so this integration test only checks that
      // `cache: false` reaches the web agent; explicit-beats-legacy precedence is
      // covered by the direct `processCacheConfig` tests above.
      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          cache: false,
        }),
        undefined,
        undefined,
      );
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

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        // Capture the setup function to call it later
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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

    test('should pass all HarmonyOS device options from YAML to agentFromHdcDevice', async () => {
      const mockHarmonyOptions = {
        deviceId: 'harmony-device-1',
        hdcPath: '/custom/path/to/hdc',
        autoDismissKeyboard: true,
        keyboardDismissStrategy: 'esc-first' as const,
        appNameMapping: { 携程: 'com.ctrip.harmonynext' },
        launch: 'com.example.app',
      };

      const mockScript: MidsceneYamlScript = {
        harmony: mockHarmonyOptions,
        tasks: [],
      };

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromHdcDevice).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify agentFromHdcDevice was called with deviceId and all options
      expect(agentFromHdcDevice).toHaveBeenCalledWith(
        mockHarmonyOptions.deviceId,
        expect.objectContaining({
          hdcPath: mockHarmonyOptions.hdcPath,
          autoDismissKeyboard: mockHarmonyOptions.autoDismissKeyboard,
          keyboardDismissStrategy: mockHarmonyOptions.keyboardDismissStrategy,
          appNameMapping: mockHarmonyOptions.appNameMapping,
          launch: mockHarmonyOptions.launch,
        }),
      );
      // Verify launch was triggered
      expect(mockAgent.launch).toHaveBeenCalledWith(mockHarmonyOptions.launch);
    });

    test('should connect first HarmonyOS device when deviceId is omitted', async () => {
      const mockScript: MidsceneYamlScript = {
        harmony: {},
        tasks: [],
      };

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromHdcDevice).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      if (setupFnCallback) {
        await setupFnCallback();
      }

      expect(agentFromHdcDevice).toHaveBeenCalledWith(
        undefined,
        expect.any(Object),
      );
      // No launch field, so launch should not be triggered
      expect(mockAgent.launch).not.toHaveBeenCalled();
    });

    test('should handle Android config with minimal options', async () => {
      const mockScript: MidsceneYamlScript = {
        android: {
          deviceId: 'test-device',
        },
        tasks: [],
      };

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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
        destroy: rs.fn(),
        connectNewTabWithUrl: rs.fn(),
      };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);

      // Mock AgentOverChromeBridge from the bridge-mode module
      const { AgentOverChromeBridge } = await import(
        '@midscene/web/bridge-mode'
      );
      rs.mocked(AgentOverChromeBridge).mockImplementation(
        (opts) => mockAgent as any,
      );

      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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

    test('should warn that downloadPath is ignored in bridge mode', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          bridgeMode: 'newTabWithUrl',
          downloadPath: './downloads',
        },
        tasks: [],
      };

      const mockAgent = {
        destroy: rs.fn(),
        connectNewTabWithUrl: rs.fn().mockResolvedValue(undefined),
      };
      const warnSpy = rs.spyOn(console, 'warn').mockImplementation(() => {});
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(AgentOverChromeBridge).mockImplementation(
        () => mockAgent as any,
      );
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);
      await setupFnCallback?.();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('downloadPath'),
      );
      warnSpy.mockRestore();
    });

    test('should handle undefined aiActionContext gracefully for Android', async () => {
      const mockScript: MidsceneYamlScript = {
        android: {
          deviceId: 'test-device',
        },
        // No agent config provided
        tasks: [],
      };

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify that when agent config is undefined, reportFileName is set from fileName
      // and aiActionContext is not present (undefined fields are not spread)
      const callArgs = getMockCallArg(rs.mocked(agentFromAdbDevice), 0, 1);
      expect(callArgs).toMatchObject({
        reportFileName: 'script-mock-report',
        deviceId: 'test-device',
      });
      expect(rs.mocked(getReportFileName)).toHaveBeenCalledWith('script');
      expect(callArgs).not.toHaveProperty('aiActionContext');
    });

    test('should handle undefined aiActionContext gracefully for iOS', async () => {
      const mockScript: MidsceneYamlScript = {
        ios: {},
        // No agent config provided
        tasks: [],
      };

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify that when agent config is undefined, reportFileName is set from fileName
      // and aiActionContext is not present (undefined fields are not spread)
      const callArgs = getMockCallArg(rs.mocked(agentFromWebDriverAgent), 0, 0);
      expect(callArgs).toMatchObject({
        reportFileName: 'script-mock-report',
      });
      expect(rs.mocked(getReportFileName)).toHaveBeenCalledWith('script');
      expect(callArgs).not.toHaveProperty('aiActionContext');
    });

    test('should generate a fresh report file name for repeated CLI runs of the same yaml file', async () => {
      const mockScript: MidsceneYamlScript = {
        ios: {},
        tasks: [],
      };

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      const setupFnCallbacks: Array<() => Promise<any>> = [];

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      rs.mocked(getReportFileName)
        .mockReturnValueOnce('script-run-1')
        .mockReturnValueOnce('script-run-2');
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallbacks.push(setupFn as () => Promise<any>);
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);
      await createYamlPlayer(mockFilePath, mockScript);

      for (const setupFn of setupFnCallbacks) {
        await setupFn();
      }

      expect(rs.mocked(agentFromWebDriverAgent).mock.calls).toHaveLength(2);
      expect(
        getMockCallArg(rs.mocked(agentFromWebDriverAgent), 0, 0),
      ).toMatchObject({
        reportFileName: 'script-run-1',
      });
      expect(
        getMockCallArg(rs.mocked(agentFromWebDriverAgent), 1, 0),
      ).toMatchObject({
        reportFileName: 'script-run-2',
      });
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

      const mockAgent = { destroy: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // Call the setup function
      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify all agent options were passed
      // Explicit YAML reportFileName should be passed through unchanged.
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

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromAdbDevice).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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

      const mockAgent = { destroy: rs.fn(), launch: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(agentFromWebDriverAgent).mockResolvedValue(mockAgent as any);
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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
        destroy: rs.fn(),
        connectCurrentTab: rs.fn().mockResolvedValue(undefined),
      };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(AgentOverChromeBridge).mockImplementation(
        (opts) => mockAgent as any,
      );
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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

    test('should prioritize CLI legacy testId over YAML legacy testId for reportFileName', async () => {
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

      const mockAgent = { destroy: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript, {
        testId: 'cli-test-id',
      });

      if (setupFnCallback) {
        await setupFnCallback();
      }

      // CLI legacy testId should take priority for reportFileName
      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          reportFileName: 'cli-test-id-mock-report',
        }),
        undefined, // browser
        undefined, // page
      );
    });

    test('should use YAML legacy testId as reportFileName when no explicit reportFileName exists', async () => {
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

      const mockAgent = { destroy: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      if (setupFnCallback) {
        await setupFnCallback();
      }

      // When no explicit reportFileName/CLI value is provided, YAML legacy testId takes precedence over fileName
      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          reportFileName: 'yaml-test-id-mock-report',
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

      const mockAgent = { destroy: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);
      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });
      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
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

  describe('CDP mode', () => {
    test('should connect via CDP endpoint and reuse puppeteerAgentForTarget', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          cdpEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
        },
        tasks: [],
      };

      const mockBrowser = {
        disconnect: rs.fn(),
      };
      const mockAgent = { destroy: rs.fn() };

      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);

      const puppeteer = (await import('puppeteer')).default;
      rs.mocked(puppeteer.connect).mockResolvedValue(mockBrowser as any);

      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });

      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Should connect via CDP
      expect(puppeteer.connect).toHaveBeenCalledWith({
        browserWSEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
        defaultViewport: null,
        downloadBehavior: undefined,
      });

      // Should reuse puppeteerAgentForTarget (page setup: viewport, userAgent, etc.)
      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'http://example.com' }),
        expect.any(Object),
        mockBrowser, // CDP browser passed as browser param
        undefined, // no shared page
      );
    });

    test('should configure download behavior via Puppeteer connect options in CDP mode', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          cdpEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
          downloadPath: './downloads',
        },
        tasks: [],
      };

      const mockBrowser = {
        disconnect: rs.fn(),
      };
      const mockAgent = { destroy: rs.fn() };
      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);

      const puppeteer = (await import('puppeteer')).default;
      rs.mocked(puppeteer.connect).mockResolvedValue(mockBrowser as any);

      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });

      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);
      await setupFnCallback?.();

      expect(puppeteer.connect).toHaveBeenCalledWith({
        browserWSEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
        defaultViewport: null,
        downloadBehavior: {
          policy: 'allow',
          downloadPath: path.resolve('./downloads'),
        },
      });
    });

    test('should pass agent options in CDP mode via puppeteerAgentForTarget', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          cdpEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
        },
        agent: {
          testId: 'cdp-test',
          groupName: 'CDP Tests',
        },
        tasks: [],
      };

      const mockBrowser = { disconnect: rs.fn() };
      const mockAgent = { destroy: rs.fn() };

      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);

      const puppeteer = (await import('puppeteer')).default;
      rs.mocked(puppeteer.connect).mockResolvedValue(mockBrowser as any);

      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });

      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Verify agent options are passed through
      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          reportFileName: 'cdp-test-mock-report',
          groupName: 'CDP Tests',
        }),
        expect.any(Object),
        undefined,
      );
    });

    test('should reuse shared browser from batch-runner in CDP mode', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          cdpEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
        },
        tasks: [],
      };

      const mockSharedBrowser = { disconnect: rs.fn() };
      const mockSharedPage = { url: rs.fn() };
      const mockAgent = { destroy: rs.fn() };

      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);

      const puppeteer = (await import('puppeteer')).default;

      rs.mocked(puppeteerAgentForTarget).mockResolvedValue({
        agent: mockAgent as any,
        freeFn: [],
      });

      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      // Pass shared browser and page from batch-runner
      await createYamlPlayer(mockFilePath, mockScript, {
        browser: mockSharedBrowser as any,
        page: mockSharedPage as any,
      });

      if (setupFnCallback) {
        await setupFnCallback();
      }

      // Should NOT call puppeteer.connect — reuse shared browser
      expect(puppeteer.connect).not.toHaveBeenCalled();

      // Should pass shared browser and page to puppeteerAgentForTarget
      expect(puppeteerAgentForTarget).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        mockSharedBrowser,
        mockSharedPage,
      );
    });

    test('should throw when both cdpEndpoint and bridgeMode are set', async () => {
      const mockScript: MidsceneYamlScript = {
        web: {
          url: 'http://example.com',
          cdpEndpoint: 'ws://localhost:9222/devtools/browser/xxx',
          bridgeMode: 'newTabWithUrl',
        },
        tasks: [],
      };

      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);

      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // The setup function should throw
      await expect(setupFnCallback!()).rejects.toThrow(
        'cdpEndpoint and bridgeMode are mutually exclusive',
      );
    });

    test('should throw when harmony is combined with another target', async () => {
      const mockScript: MidsceneYamlScript = {
        web: { url: 'http://example.com' },
        harmony: { deviceId: 'harmony-device-1' },
        tasks: [],
      };

      let setupFnCallback: (() => Promise<any>) | undefined;

      rs.mocked(readFileSync).mockReturnValue('mock yaml content');
      rs.mocked(parseYamlScript).mockReturnValue(mockScript);

      rs.mocked(ScriptPlayer).mockImplementation((script, setupFn) => {
        setupFnCallback = setupFn as () => Promise<any>;
        return {
          addCleanup: rs.fn(),
        } as unknown as ScriptPlayer<MidsceneYamlScriptEnv>;
      });

      await createYamlPlayer(mockFilePath, mockScript);

      // The setup function should reject because two targets are specified
      await expect(setupFnCallback!()).rejects.toThrow(
        /Only one target type can be specified, but found multiple: web, harmony/,
      );
    });
  });
});
