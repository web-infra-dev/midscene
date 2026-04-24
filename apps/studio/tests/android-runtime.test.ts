import { describe, expect, it, vi } from 'vitest';
import {
  createStudioCorsOptions,
  isAllowedStudioOrigin,
} from '../src/main/playground/cors';
import { createMultiPlatformRuntimeService } from '../src/main/playground/multi-platform-runtime';

describe('android runtime CORS policy', () => {
  it('allows Studio origins used by Electron and local renderer dev', () => {
    expect(isAllowedStudioOrigin(undefined)).toBe(true);
    expect(isAllowedStudioOrigin('null')).toBe(true);
    expect(isAllowedStudioOrigin('file://')).toBe(true);
    expect(isAllowedStudioOrigin('http://127.0.0.1:3210')).toBe(true);
    expect(isAllowedStudioOrigin('http://localhost:3210')).toBe(true);
  });

  it('rejects non-loopback browser origins', () => {
    expect(isAllowedStudioOrigin('https://midscenejs.com')).toBe(false);
    expect(isAllowedStudioOrigin('http://192.168.1.10:3210')).toBe(false);
    expect(isAllowedStudioOrigin('not-a-url')).toBe(false);
  });

  it('builds matching cors options', () => {
    const corsOptions = createStudioCorsOptions();
    const originResolver = corsOptions.origin;

    let allowedResult: boolean | undefined;
    originResolver('http://127.0.0.1:3210', (error, allowed) => {
      expect(error).toBeNull();
      allowedResult = allowed;
    });

    let blockedResult: boolean | undefined;
    originResolver('https://midscenejs.com', (error, allowed) => {
      expect(error).toBeNull();
      blockedResult = allowed;
    });

    expect(allowedResult).toBe(true);
    expect(blockedResult).toBe(false);
    expect(corsOptions.credentials).toBe(true);
  });
});

describe('playground runtime bootstrap', () => {
  it('reports dependency load failures through the bootstrap state', async () => {
    const runtime = createMultiPlatformRuntimeService({
      loadModules: async () => {
        throw new Error('Synthetic dependency resolution failure');
      },
    });

    await expect(runtime.start()).resolves.toEqual({
      status: 'error',
      serverUrl: null,
      port: null,
      error: 'Synthetic dependency resolution failure',
    });

    expect(runtime.getBootstrap()).toEqual({
      status: 'error',
      serverUrl: null,
      port: null,
      error: 'Synthetic dependency resolution failure',
    });
  });

  it('defers platform module loading until a platform is actually prepared', async () => {
    let androidLoadCount = 0;
    let computerLoadCount = 0;
    let harmonyLoadCount = 0;
    let iosLoadCount = 0;
    let capturedPlatforms:
      | import('@midscene/playground').RegisteredPlaygroundPlatform[]
      | undefined;

    const runtime = createMultiPlatformRuntimeService({
      loadPlaygroundCore: async () => ({
        launchPreparedPlaygroundPlatform: async () => ({
          close: async () => undefined,
          host: '127.0.0.1',
          port: 5800,
          server: {
            setPreparedPlatform: () => undefined,
          },
        }),
        prepareMultiPlatformPlayground: async (platforms) => {
          capturedPlatforms = platforms;
          return {
            platformId: 'multi-platform',
            title: 'Midscene Studio',
            description: 'Multi-platform playground',
            metadata: {},
            sessionManager: {
              createSession: async () => {
                throw new Error('not needed for bootstrap');
              },
            },
          };
        },
      }),
      loadAndroidModule: async () => {
        androidLoadCount += 1;
        throw new Error('android should stay lazy');
      },
      loadComputerModule: async () => {
        computerLoadCount += 1;
        throw new Error('computer should stay lazy');
      },
      loadHarmonyModule: async () => {
        harmonyLoadCount += 1;
        throw new Error('harmony should stay lazy');
      },
      loadIosModule: async () => {
        iosLoadCount += 1;
        throw new Error('ios should stay lazy');
      },
    });

    await expect(runtime.start()).resolves.toEqual({
      status: 'ready',
      serverUrl: 'http://127.0.0.1:5800',
      port: 5800,
      error: null,
    });

    expect(capturedPlatforms?.map((platform) => platform.id)).toEqual([
      'android',
      'ios',
      'harmony',
      'computer',
    ]);
    expect(androidLoadCount).toBe(0);
    expect(computerLoadCount).toBe(0);
    expect(harmonyLoadCount).toBe(0);
    expect(iosLoadCount).toBe(0);

    await expect(capturedPlatforms?.[0]?.prepare()).rejects.toThrow(
      'android should stay lazy',
    );
    expect(androidLoadCount).toBe(1);
  });

  it('prepares Harmony in deferred mode so Studio never exits on device selection', async () => {
    const harmonyPrepare = vi.fn(async () => ({
      platformId: 'harmony',
      title: 'Midscene HarmonyOS Playground',
      metadata: {
        sessionConnected: false,
        setupState: 'required',
      },
      sessionManager: {
        createSession: async () => ({
          displayName: 'unused',
        }),
      },
    }));
    let capturedPlatforms:
      | import('@midscene/playground').RegisteredPlaygroundPlatform[]
      | undefined;

    const runtime = createMultiPlatformRuntimeService({
      loadPlaygroundCore: async () => ({
        launchPreparedPlaygroundPlatform: async () => ({
          close: async () => undefined,
          host: '127.0.0.1',
          port: 5800,
          server: {
            setPreparedPlatform: () => undefined,
          },
        }),
        prepareMultiPlatformPlayground: async (platforms) => {
          capturedPlatforms = platforms;
          return {
            platformId: 'multi-platform',
            title: 'Midscene Studio',
            description: 'Multi-platform playground',
            metadata: {},
            sessionManager: {
              createSession: async () => {
                throw new Error('not needed for bootstrap');
              },
            },
          };
        },
      }),
      loadHarmonyModule: async () => ({
        harmonyPlaygroundPlatform: {
          prepare: harmonyPrepare,
        },
      }),
      resolvePackageStaticDir: (packageName) => `/virtual/${packageName}`,
    });

    await expect(runtime.start()).resolves.toEqual({
      status: 'ready',
      serverUrl: 'http://127.0.0.1:5800',
      port: 5800,
      error: null,
    });

    await capturedPlatforms?.[2]?.prepare();

    expect(harmonyPrepare).toHaveBeenCalledWith({
      staticDir: '/virtual/@midscene/harmony',
      deferConnection: true,
    });
  });
});
