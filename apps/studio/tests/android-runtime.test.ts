import type { RegisteredPlaygroundPlatform } from '@midscene/playground';
import { describe, expect, it, vi } from 'vitest';
import {
  createStudioCorsOptions,
  isAllowedStudioOrigin,
} from '../src/main/playground/cors';
import {
  createMultiPlatformRuntimeService,
  type loadWebPlaygroundModule,
} from '../src/main/playground/multi-platform-runtime';

type RuntimeServiceOptions = NonNullable<
  Parameters<typeof createMultiPlatformRuntimeService>[0]
>;
type PlaygroundCoreLoader = NonNullable<
  RuntimeServiceOptions['loadPlaygroundCore']
>;
type HarmonyModuleLoader = NonNullable<
  RuntimeServiceOptions['loadHarmonyModule']
>;

const buildPlaygroundBrowserUrl = (host: string, port: number) => {
  const normalizedHost =
    host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${normalizedHost}:${port}`;
};

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
    let webLoadCount = 0;
    let capturedPlatforms:
      | import('@midscene/playground').RegisteredPlaygroundPlatform[]
      | undefined;

    const runtime = createMultiPlatformRuntimeService({
      loadPlaygroundCore: (async () =>
        ({
          launchPreparedPlaygroundPlatform: async () => ({
            close: async () => undefined,
            host: '::1',
            port: 5800,
            server: {
              setPreparedPlatform: () => undefined,
            },
          }),
          buildPlaygroundBrowserUrl,
          prepareMultiPlatformPlayground: async (
            platforms: RegisteredPlaygroundPlatform[],
          ) => {
            capturedPlatforms = platforms;
            return {
              platformId: 'multi-platform',
              title: 'Midscene Studio Beta',
              description: 'Multi-platform playground',
              metadata: {},
              sessionManager: {
                createSession: async () => {
                  throw new Error('not needed for bootstrap');
                },
              },
            };
          },
        }) as unknown as Awaited<
          ReturnType<PlaygroundCoreLoader>
        >) as PlaygroundCoreLoader,
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
      loadWebModule: async () => {
        webLoadCount += 1;
        throw new Error('web should stay lazy');
      },
    });

    await expect(runtime.start()).resolves.toEqual({
      status: 'ready',
      serverUrl: 'http://[::1]:5800',
      port: 5800,
      error: null,
    });

    expect(capturedPlatforms?.map((platform) => platform.id)).toEqual([
      'web',
      'android',
      'ios',
      'harmony',
      'computer',
    ]);
    expect(androidLoadCount).toBe(0);
    expect(computerLoadCount).toBe(0);
    expect(harmonyLoadCount).toBe(0);
    expect(iosLoadCount).toBe(0);
    expect(webLoadCount).toBe(0);

    await expect(capturedPlatforms?.[0]?.prepare()).rejects.toThrow(
      'web should stay lazy',
    );
    expect(webLoadCount).toBe(1);

    await expect(capturedPlatforms?.[1]?.prepare()).rejects.toThrow(
      'android should stay lazy',
    );
    expect(androidLoadCount).toBe(1);
  });

  it('prepares a Web session with Puppeteer and MJPEG preview metadata', async () => {
    const cleanupBrowser = vi.fn();
    const destroyAgent = vi.fn();
    const launchPuppeteerPage = vi.fn(async () => ({
      page: { id: 'puppeteer-page' },
      freeFn: [
        {
          name: 'puppeteer_browser',
          fn: cleanupBrowser,
        },
      ],
    }));
    class FakePuppeteerAgent {
      interface = { interfaceType: 'web' };

      constructor(
        public page: unknown,
        public opts: unknown,
      ) {}

      destroy = destroyAgent;
    }
    let capturedPlatforms:
      | import('@midscene/playground').RegisteredPlaygroundPlatform[]
      | undefined;

    const runtime = createMultiPlatformRuntimeService({
      agentOptions: {
        aiActContext: 'Prefer visible controls',
        screenshotShrinkFactor: 24,
      },
      loadPlaygroundCore: (async () =>
        ({
          launchPreparedPlaygroundPlatform: async () => ({
            close: async () => undefined,
            host: '127.0.0.1',
            port: 5800,
            server: {
              setPreparedPlatform: () => undefined,
            },
          }),
          buildPlaygroundBrowserUrl,
          prepareMultiPlatformPlayground: async (
            platforms: RegisteredPlaygroundPlatform[],
          ) => {
            capturedPlatforms = platforms;
            return {
              platformId: 'multi-platform',
              title: 'Midscene Studio Beta',
              description: 'Multi-platform playground',
              metadata: {},
              sessionManager: {
                createSession: async () => {
                  throw new Error('not needed for bootstrap');
                },
              },
            };
          },
        }) as unknown as Awaited<
          ReturnType<PlaygroundCoreLoader>
        >) as PlaygroundCoreLoader,
      loadWebModule: (async () =>
        ({
          PuppeteerAgent: FakePuppeteerAgent,
          launchPuppeteerPage,
        }) as unknown as Awaited<
          ReturnType<typeof loadWebPlaygroundModule>
        >) as typeof loadWebPlaygroundModule,
    });

    await expect(runtime.start()).resolves.toEqual({
      status: 'ready',
      serverUrl: 'http://127.0.0.1:5800',
      port: 5800,
      error: null,
    });

    const webPlatform = capturedPlatforms?.find(
      (platform) => platform.id === 'web',
    );
    const prepared = await webPlatform?.prepare();
    expect(prepared?.preview?.kind).toBe('mjpeg');
    expect(prepared?.metadata?.interfaceType).toBe('web');

    const setup = await prepared?.sessionManager?.getSetupSchema?.();
    expect(setup?.primaryActionLabel).toBe('Open Page');
    expect(setup?.fields.map((field) => field.key)).toEqual([
      'url',
      'viewportWidth',
      'viewportHeight',
      'headed',
    ]);
    expect(setup?.fields.find((field) => field.key === 'url')).toMatchObject({
      defaultValue: 'https://todomvc.com/examples/react/dist/',
      placeholder: 'https://todomvc.com/examples/react/dist/',
    });
    expect(
      setup?.fields.find((field) => field.key === 'viewportWidth'),
    ).toMatchObject({ defaultValue: 1280 });
    expect(
      setup?.fields.find((field) => field.key === 'viewportHeight'),
    ).toMatchObject({ defaultValue: 720 });

    const defaultSession = await prepared?.sessionManager?.createSession({});
    expect(defaultSession?.displayName).toBe(
      'https://todomvc.com/examples/react/dist/',
    );
    expect(defaultSession?.metadata?.url).toBe(
      'https://todomvc.com/examples/react/dist/',
    );

    const session = await prepared?.sessionManager?.createSession({
      url: 'localhost:4173',
      viewportWidth: 900,
      viewportHeight: 700,
      headed: true,
    });
    const agent = await session?.agentFactory?.();

    expect(launchPuppeteerPage).toHaveBeenCalledWith(
      {
        url: 'http://localhost:4173',
        viewportWidth: 900,
        viewportHeight: 700,
      },
      {
        headed: true,
      },
    );
    expect(session?.displayName).toBe('http://localhost:4173');
    expect(session?.metadata?.sessionDisplayName).toBe('http://localhost:4173');
    expect(session?.preview?.kind).toBe('mjpeg');
    expect(agent).toBeInstanceOf(FakePuppeteerAgent);
    expect((agent as FakePuppeteerAgent).opts).toEqual({
      aiActContext: 'Prefer visible controls',
      screenshotShrinkFactor: 24,
      cacheId: 'studio-web',
    });

    await prepared?.sessionManager?.destroySession?.();
    expect(destroyAgent).toHaveBeenCalledTimes(1);
    expect(cleanupBrowser).toHaveBeenCalledTimes(1);
  });

  it('serializes restarts with immutable option snapshots for platform preparation', async () => {
    const close = vi.fn(async () => undefined);
    const iosPrepare = vi.fn(async () => ({
      platformId: 'ios',
      title: 'iOS',
    }));
    const platformGenerations: RegisteredPlaygroundPlatform[][] = [];
    let port = 5800;
    const runtime = createMultiPlatformRuntimeService({
      agentOptions: { waitAfterAction: 100 },
      loadPlaygroundCore: (async () =>
        ({
          launchPreparedPlaygroundPlatform: async () => ({
            close,
            host: '127.0.0.1',
            port: port++,
            server: { setPreparedPlatform: () => undefined },
          }),
          buildPlaygroundBrowserUrl,
          prepareMultiPlatformPlayground: async (
            platforms: RegisteredPlaygroundPlatform[],
          ) => {
            platformGenerations.push(platforms);
            return {
              platformId: 'multi-platform',
              title: 'Studio',
              metadata: {},
            };
          },
        }) as unknown as Awaited<
          ReturnType<PlaygroundCoreLoader>
        >) as PlaygroundCoreLoader,
      loadIosModule: (async () =>
        ({
          iosPlaygroundPlatform: { prepare: iosPrepare },
        }) as never) as RuntimeServiceOptions['loadIosModule'],
    });

    await runtime.start();
    await platformGenerations[0][2].prepare();
    const firstRestart = runtime.restart({ waitAfterAction: 200 });
    const secondRestart = runtime.restart({ waitAfterAction: 300 });
    await Promise.all([firstRestart, secondRestart]);
    await platformGenerations[1][2].prepare();
    await platformGenerations[2][2].prepare();

    expect(close).toHaveBeenCalledTimes(2);
    expect(iosPrepare).toHaveBeenNthCalledWith(1, {
      agentOptions: { waitAfterAction: 100 },
      staticDir: expect.any(String),
    });
    expect(iosPrepare).toHaveBeenNthCalledWith(2, {
      agentOptions: { waitAfterAction: 200 },
      staticDir: expect.any(String),
    });
    expect(iosPrepare).toHaveBeenNthCalledWith(3, {
      agentOptions: { waitAfterAction: 300 },
      staticDir: expect.any(String),
    });
  });

  it('restores the previous runtime after a settings restart fails', async () => {
    const iosPrepare = vi.fn(async () => ({
      platformId: 'ios',
      title: 'iOS',
    }));
    const platformGenerations: RegisteredPlaygroundPlatform[][] = [];
    let launchCount = 0;
    const runtime = createMultiPlatformRuntimeService({
      agentOptions: { waitAfterAction: 100 },
      loadPlaygroundCore: (async () =>
        ({
          launchPreparedPlaygroundPlatform: async () => {
            launchCount += 1;
            if (launchCount === 2) {
              throw new Error('Synthetic restart failure');
            }
            return {
              close: async () => undefined,
              host: '127.0.0.1',
              port: 5800 + launchCount,
              server: { setPreparedPlatform: () => undefined },
            };
          },
          buildPlaygroundBrowserUrl,
          prepareMultiPlatformPlayground: async (
            platforms: RegisteredPlaygroundPlatform[],
          ) => {
            platformGenerations.push(platforms);
            return {
              platformId: 'multi-platform',
              title: 'Studio',
              metadata: {},
            };
          },
        }) as unknown as Awaited<
          ReturnType<PlaygroundCoreLoader>
        >) as PlaygroundCoreLoader,
      loadIosModule: (async () =>
        ({
          iosPlaygroundPlatform: { prepare: iosPrepare },
        }) as never) as RuntimeServiceOptions['loadIosModule'],
    });

    await runtime.start();
    const restartResult = await runtime.restart({ waitAfterAction: 999 });
    expect(restartResult).toEqual(
      expect.objectContaining({
        status: 'ready',
        error: null,
        settingsApplyError: 'Synthetic restart failure',
      }),
    );
    expect(runtime.getBootstrap()).not.toHaveProperty('settingsApplyError');
    await platformGenerations[2][2].prepare();

    expect(iosPrepare).toHaveBeenCalledWith({
      agentOptions: { waitAfterAction: 100 },
      staticDir: expect.any(String),
    });
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
      loadPlaygroundCore: (async () =>
        ({
          launchPreparedPlaygroundPlatform: async () => ({
            close: async () => undefined,
            host: '127.0.0.1',
            port: 5800,
            server: {
              setPreparedPlatform: () => undefined,
            },
          }),
          buildPlaygroundBrowserUrl,
          prepareMultiPlatformPlayground: async (
            platforms: RegisteredPlaygroundPlatform[],
          ) => {
            capturedPlatforms = platforms;
            return {
              platformId: 'multi-platform',
              title: 'Midscene Studio Beta',
              description: 'Multi-platform playground',
              metadata: {},
              sessionManager: {
                createSession: async () => {
                  throw new Error('not needed for bootstrap');
                },
              },
            };
          },
        }) as unknown as Awaited<
          ReturnType<PlaygroundCoreLoader>
        >) as PlaygroundCoreLoader,
      loadHarmonyModule: (async () =>
        ({
          harmonyPlaygroundPlatform: {
            prepare: harmonyPrepare,
          },
        }) as unknown as Awaited<
          ReturnType<HarmonyModuleLoader>
        >) as HarmonyModuleLoader,
      resolvePackageStaticDir: (packageName) => `/virtual/${packageName}`,
    });

    await expect(runtime.start()).resolves.toEqual({
      status: 'ready',
      serverUrl: 'http://127.0.0.1:5800',
      port: 5800,
      error: null,
    });

    await capturedPlatforms?.[3]?.prepare();

    expect(harmonyPrepare).toHaveBeenCalledWith({
      staticDir: '/virtual/@midscene/harmony',
      deferConnection: true,
    });
  });
});
