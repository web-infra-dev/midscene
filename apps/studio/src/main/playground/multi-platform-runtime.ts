import { createRequire } from 'node:module';
import path from 'node:path';
import type { Agent } from '@midscene/core/agent';
import type {
  LaunchPlaygroundResult,
  PlaygroundPreviewDescriptor,
  PreparedPlaygroundPlatform,
  RegisteredPlaygroundPlatform,
} from '@midscene/playground';
import { getDebug } from '@midscene/shared/logger';
import type { DiscoveredDevice } from '@shared/electron-contract';
import type { PlaygroundBootstrap } from '@shared/electron-contract';
import { ensureStudioShellEnvHydrated } from '../shell-env';
import { createStudioCorsOptions } from './cors';
import type { DeviceDiscoveryService } from './device-discovery';
import type { PlaygroundRuntimeService } from './types';

const require = createRequire(__filename);
const debugWebRuntime = getDebug('studio:web-runtime', { console: true });

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unknown playground runtime error';
}

type PlaygroundCoreModules = Pick<
  MultiPlatformRuntimeModules,
  'launchPreparedPlaygroundPlatform' | 'prepareMultiPlatformPlayground'
>;

type AndroidPlaygroundModule = typeof import('@midscene/android-playground');
type ComputerPlaygroundModule = typeof import('@midscene/computer-playground');
type HarmonyPlaygroundModule = typeof import('@midscene/harmony');
type IosPlaygroundModule = typeof import('@midscene/ios');
type PlaygroundModule = typeof import('@midscene/playground');

type StudioPuppeteerAgentConstructor = new (
  page: unknown,
  opts?: { cacheId?: string },
) => Agent;

type StudioLaunchPuppeteerPage = (
  target: {
    url: string;
    viewportWidth: number;
    viewportHeight: number;
  },
  preference?: {
    headed?: boolean;
  },
) => Promise<{
  page: unknown;
  freeFn: StudioWebCleanup[];
}>;

type MultiPlatformRuntimeModules = {
  ScrcpyServer: AndroidPlaygroundModule['ScrcpyServer'];
  androidPlaygroundPlatform: AndroidPlaygroundModule['androidPlaygroundPlatform'];
  computerPlaygroundPlatform: ComputerPlaygroundModule['computerPlaygroundPlatform'];
  harmonyPlaygroundPlatform: HarmonyPlaygroundModule['harmonyPlaygroundPlatform'];
  iosPlaygroundPlatform: IosPlaygroundModule['iosPlaygroundPlatform'];
  launchPreparedPlaygroundPlatform: PlaygroundModule['launchPreparedPlaygroundPlatform'];
  prepareMultiPlatformPlayground: PlaygroundModule['prepareMultiPlatformPlayground'];
  PuppeteerAgent: StudioPuppeteerAgentConstructor;
  launchPuppeteerPage: StudioLaunchPuppeteerPage;
};

type StudioWebCleanup = {
  name: string;
  fn: () => void | Promise<void>;
};

type StudioDeviceDiscoveryService =
  | DeviceDiscoveryService
  | Promise<DeviceDiscoveryService>;

const resolvePackageRootDir = (packageName: string): string =>
  path.resolve(path.dirname(require.resolve(packageName)), '..', '..');

const requirePackageModule = <ModuleType>(
  packageName: string,
  relativeModulePath: string,
): ModuleType =>
  require(path.join(resolvePackageRootDir(packageName), relativeModulePath));

export async function loadPlaygroundCoreModules(): Promise<PlaygroundCoreModules> {
  const multiPlatformModule = requirePackageModule<
    Pick<
      typeof import('@midscene/playground'),
      'prepareMultiPlatformPlayground'
    >
  >('@midscene/playground', 'dist/lib/multi-platform.js');
  const platformLauncherModule = requirePackageModule<
    Pick<
      typeof import('@midscene/playground'),
      'launchPreparedPlaygroundPlatform'
    >
  >('@midscene/playground', 'dist/lib/platform-launcher.js');

  return {
    prepareMultiPlatformPlayground:
      multiPlatformModule.prepareMultiPlatformPlayground,
    launchPreparedPlaygroundPlatform:
      platformLauncherModule.launchPreparedPlaygroundPlatform,
  };
}

export async function loadAndroidPlaygroundModule(): Promise<
  Pick<
    MultiPlatformRuntimeModules,
    'ScrcpyServer' | 'androidPlaygroundPlatform'
  >
> {
  ensureStudioShellEnvHydrated();
  return require('@midscene/android-playground');
}

export async function loadComputerPlaygroundModule(): Promise<
  Pick<MultiPlatformRuntimeModules, 'computerPlaygroundPlatform'>
> {
  return require('@midscene/computer-playground');
}

export async function loadHarmonyPlaygroundModule(): Promise<
  Pick<MultiPlatformRuntimeModules, 'harmonyPlaygroundPlatform'>
> {
  ensureStudioShellEnvHydrated();
  return require('@midscene/harmony');
}

export async function loadIosPlaygroundModule(): Promise<
  Pick<MultiPlatformRuntimeModules, 'iosPlaygroundPlatform'>
> {
  ensureStudioShellEnvHydrated();
  return require('@midscene/ios');
}

export async function loadWebPlaygroundModule(): Promise<
  Pick<MultiPlatformRuntimeModules, 'PuppeteerAgent' | 'launchPuppeteerPage'>
> {
  ensureStudioShellEnvHydrated();
  const webModule = require('@midscene/web/puppeteer') as {
    PuppeteerAgent: StudioPuppeteerAgentConstructor;
  };
  const launcherModule = require('@midscene/web/puppeteer-agent-launcher') as {
    launchPuppeteerPage: StudioLaunchPuppeteerPage;
  };

  return {
    PuppeteerAgent: webModule.PuppeteerAgent,
    launchPuppeteerPage: launcherModule.launchPuppeteerPage,
  };
}

export async function loadMultiPlatformRuntimeModules(): Promise<MultiPlatformRuntimeModules> {
  const [
    androidPlaygroundModule,
    computerPlaygroundModule,
    harmonyPlaygroundModule,
    iosPlaygroundModule,
    playgroundCoreModules,
    webPlaygroundModule,
  ] = await Promise.all([
    loadAndroidPlaygroundModule(),
    loadComputerPlaygroundModule(),
    loadHarmonyPlaygroundModule(),
    loadIosPlaygroundModule(),
    loadPlaygroundCoreModules(),
    loadWebPlaygroundModule(),
  ]);

  return {
    ScrcpyServer: androidPlaygroundModule.ScrcpyServer,
    androidPlaygroundPlatform:
      androidPlaygroundModule.androidPlaygroundPlatform,
    computerPlaygroundPlatform:
      computerPlaygroundModule.computerPlaygroundPlatform,
    harmonyPlaygroundPlatform:
      harmonyPlaygroundModule.harmonyPlaygroundPlatform,
    iosPlaygroundPlatform: iosPlaygroundModule.iosPlaygroundPlatform,
    launchPreparedPlaygroundPlatform:
      playgroundCoreModules.launchPreparedPlaygroundPlatform,
    prepareMultiPlatformPlayground:
      playgroundCoreModules.prepareMultiPlatformPlayground,
    PuppeteerAgent: webPlaygroundModule.PuppeteerAgent,
    launchPuppeteerPage: webPlaygroundModule.launchPuppeteerPage,
  };
}

export function resolveStaticDir(packageName: string): string {
  return path.join(resolvePackageRootDir(packageName), 'static');
}

interface StudioPlatformSpec {
  id: string;
  label: string;
  description: string;
  staticDirPackage: string;
  prepare: (staticDir: string) => Promise<PreparedPlaygroundPlatform>;
}

function toScrcpyDeviceList(devices: DiscoveredDevice[]) {
  return devices
    .filter((device) => device.platformId === 'android')
    .map((device) => ({
      id: device.id,
      name: device.label,
      status: device.status || 'device',
    }));
}

async function createScrcpyDeviceListSource(
  deviceDiscoveryService: StudioDeviceDiscoveryService,
) {
  const resolvedService = await deviceDiscoveryService;
  return {
    async getDevices() {
      const snapshot = await resolvedService.getSnapshot();
      return toScrcpyDeviceList(snapshot.devices);
    },
    subscribe(
      listener: (devices: ReturnType<typeof toScrcpyDeviceList>) => void,
    ) {
      return resolvedService.subscribe((snapshot) => {
        listener(toScrcpyDeviceList(snapshot.devices));
      });
    },
  };
}

const DEFAULT_STUDIO_WEB_URL = 'https://todomvc.com/examples/react/dist/';

function normalizeWebUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return DEFAULT_STUDIO_WEB_URL;
  }
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw)) {
    return raw;
  }
  if (
    /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\])(?::|\/|$)/i.test(raw)
  ) {
    return `http://${raw}`;
  }
  return `https://${raw}`;
}

function normalizeViewportDimension(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(Math.round(value), 100);
}

async function runWebCleanup(cleanupFns: StudioWebCleanup[] | null) {
  for (const cleanup of cleanupFns || []) {
    try {
      await cleanup.fn();
    } catch (error) {
      debugWebRuntime(
        `cleanup "${cleanup.name}" failed: ${getErrorMessage(error)}`,
      );
    }
  }
}

function createStudioWebPreviewDescriptor(): PlaygroundPreviewDescriptor {
  return {
    kind: 'mjpeg',
    title: 'Web page preview',
    screenshotPath: '/screenshot',
    mjpegPath: '/mjpeg',
    capabilities: [
      {
        kind: 'mjpeg',
        label: 'MJPEG streaming',
        live: true,
      },
      {
        kind: 'screenshot',
        label: 'Screenshot fallback',
        live: false,
      },
    ],
  };
}

async function prepareStudioWebPlatform({
  loadWebModule,
}: {
  loadWebModule: typeof loadWebPlaygroundModule;
}): Promise<PreparedPlaygroundPlatform> {
  const webModule = await loadWebModule();
  let currentCleanup: StudioWebCleanup[] | null = null;

  return {
    platformId: 'web',
    title: 'Midscene Web Playground',
    description: 'Open and control a Chromium page',
    preview: createStudioWebPreviewDescriptor(),
    metadata: {
      interfaceType: 'web',
    },
    sessionManager: {
      async getSetupSchema() {
        return {
          title: 'Open a web page',
          description: 'Start a Chromium page and stream it into Studio.',
          primaryActionLabel: 'Open Page',
          fields: [
            {
              key: 'url',
              label: 'URL',
              type: 'text',
              required: true,
              defaultValue: DEFAULT_STUDIO_WEB_URL,
              placeholder: DEFAULT_STUDIO_WEB_URL,
            },
            {
              key: 'viewportWidth',
              label: 'Viewport width',
              type: 'number',
              defaultValue: 1280,
            },
            {
              key: 'viewportHeight',
              label: 'Viewport height',
              type: 'number',
              defaultValue: 768,
            },
            {
              key: 'headed',
              label: 'Browser window',
              type: 'select',
              defaultValue: false,
              options: [
                {
                  label: 'Headless',
                  value: false,
                },
                {
                  label: 'Visible Chrome window',
                  value: true,
                },
              ],
            },
          ],
        };
      },
      async createSession(input) {
        await runWebCleanup(currentCleanup);
        currentCleanup = null;

        const url = normalizeWebUrl(input?.url);
        const viewportWidth = normalizeViewportDimension(
          input?.viewportWidth,
          1280,
        );
        const viewportHeight = normalizeViewportDimension(
          input?.viewportHeight,
          768,
        );
        const headed = input?.headed === true;

        const agentFactory = async () => {
          await runWebCleanup(currentCleanup);
          currentCleanup = null;

          const { page, freeFn } = await webModule.launchPuppeteerPage(
            {
              url,
              viewportWidth,
              viewportHeight,
            },
            {
              headed,
            },
          );
          const agent = new webModule.PuppeteerAgent(page, {
            cacheId: 'studio-web',
          });
          currentCleanup = [
            {
              name: 'studio_web_agent',
              fn: () => agent.destroy(),
            },
            ...freeFn,
          ];
          return agent;
        };

        return {
          agentFactory,
          displayName: url,
          metadata: {
            interfaceType: 'web',
            sessionDisplayName: url,
            url,
          },
          platformId: 'web',
          preview: createStudioWebPreviewDescriptor(),
          title: 'Midscene Web Playground',
        };
      },
      async destroySession() {
        await runWebCleanup(currentCleanup);
        currentCleanup = null;
      },
    },
  };
}

const createStudioPlatformSpecs = ({
  loadAndroidModule = loadAndroidPlaygroundModule,
  loadComputerModule = loadComputerPlaygroundModule,
  deviceDiscoveryService,
  loadHarmonyModule = loadHarmonyPlaygroundModule,
  loadIosModule = loadIosPlaygroundModule,
  loadWebModule = loadWebPlaygroundModule,
}: {
  loadAndroidModule?: typeof loadAndroidPlaygroundModule;
  loadComputerModule?: typeof loadComputerPlaygroundModule;
  deviceDiscoveryService?: StudioDeviceDiscoveryService;
  loadHarmonyModule?: typeof loadHarmonyPlaygroundModule;
  loadIosModule?: typeof loadIosPlaygroundModule;
  loadWebModule?: typeof loadWebPlaygroundModule;
} = {}): StudioPlatformSpec[] => [
  {
    id: 'web',
    label: 'Web',
    description: 'Open and control a Chromium page',
    staticDirPackage: '@midscene/web',
    prepare: async () =>
      prepareStudioWebPlatform({
        loadWebModule,
      }),
  },
  {
    id: 'android',
    label: 'Android',
    description: 'Connect to an Android device via ADB',
    staticDirPackage: '@midscene/android-playground',
    prepare: async (staticDir) => {
      const androidModule = await loadAndroidModule();
      return androidModule.androidPlaygroundPlatform.prepare({
        staticDir,
        scrcpyServer: new androidModule.ScrcpyServer(
          deviceDiscoveryService
            ? {
                deviceListSource: await createScrcpyDeviceListSource(
                  deviceDiscoveryService,
                ),
              }
            : undefined,
        ),
      });
    },
  },
  {
    id: 'ios',
    label: 'iOS',
    description: 'Connect to an iOS device via WebDriverAgent',
    staticDirPackage: '@midscene/ios',
    prepare: async (staticDir) => {
      const iosModule = await loadIosModule();
      return iosModule.iosPlaygroundPlatform.prepare({ staticDir });
    },
  },
  {
    id: 'harmony',
    label: 'HarmonyOS',
    description: 'Connect to a HarmonyOS device via HDC',
    staticDirPackage: '@midscene/harmony',
    prepare: async (staticDir) => {
      const harmonyModule = await loadHarmonyModule();
      return harmonyModule.harmonyPlaygroundPlatform.prepare({
        staticDir,
        deferConnection: true,
      });
    },
  },
  {
    id: 'computer',
    label: 'Computer',
    description: 'Control the local desktop',
    staticDirPackage: '@midscene/computer-playground',
    // In the Electron context, pass null — the computer agent works
    // without a window controller, it just won't auto-minimize Studio
    // during task execution. A follow-up can provide an Electron-native
    // adapter that calls mainWindow.minimize()/restore().
    prepare: async (staticDir) => {
      const computerModule = await loadComputerModule();
      return computerModule.computerPlaygroundPlatform.prepare({
        staticDir,
        getWindowController: () => null,
      });
    },
  },
];

function buildRegisteredPlatforms(
  studioPlatformSpecs: StudioPlatformSpec[],
  resolvePackageStaticDir: (packageName: string) => string,
): RegisteredPlaygroundPlatform[] {
  return studioPlatformSpecs.map((spec) => {
    const staticDir = resolvePackageStaticDir(spec.staticDirPackage);
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      prepare: () => spec.prepare(staticDir),
    };
  });
}

/**
 * Creates a multi-platform playground runtime service for the Studio
 * Electron main process. On `start()`, it registers all platforms
 * (Web, Android, iOS, HarmonyOS, Computer) with
 * `prepareMultiPlatformPlayground` and launches a SINGLE unified HTTP
 * server. The renderer talks to this one server; the platform selector
 * on the setup form routes to the correct backend.
 */
export function createMultiPlatformRuntimeService({
  deviceDiscoveryService,
  loadModules,
  loadPlaygroundCore = loadPlaygroundCoreModules,
  loadAndroidModule = loadAndroidPlaygroundModule,
  loadComputerModule = loadComputerPlaygroundModule,
  loadHarmonyModule = loadHarmonyPlaygroundModule,
  loadIosModule = loadIosPlaygroundModule,
  loadWebModule = loadWebPlaygroundModule,
  resolvePackageStaticDir = resolveStaticDir,
}: {
  deviceDiscoveryService?: StudioDeviceDiscoveryService;
  loadModules?: () => Promise<MultiPlatformRuntimeModules>;
  loadPlaygroundCore?: () => Promise<PlaygroundCoreModules>;
  loadAndroidModule?: typeof loadAndroidPlaygroundModule;
  loadComputerModule?: typeof loadComputerPlaygroundModule;
  loadHarmonyModule?: typeof loadHarmonyPlaygroundModule;
  loadIosModule?: typeof loadIosPlaygroundModule;
  loadWebModule?: typeof loadWebPlaygroundModule;
  resolvePackageStaticDir?: (packageName: string) => string;
} = {}): PlaygroundRuntimeService {
  let bootstrap: PlaygroundBootstrap = {
    status: 'starting',
    serverUrl: null,
    port: null,
    error: null,
  };
  let launchResult: LaunchPlaygroundResult | null = null;
  let startPromise: Promise<PlaygroundBootstrap> | null = null;

  const close = async () => {
    if (!launchResult) {
      return;
    }
    const activeLaunch = launchResult;
    launchResult = null;
    await activeLaunch.close();
  };

  const start = async (): Promise<PlaygroundBootstrap> => {
    if (launchResult) {
      return bootstrap;
    }
    if (startPromise) {
      return startPromise;
    }

    bootstrap = {
      status: 'starting',
      serverUrl: null,
      port: null,
      error: null,
    };

    startPromise = (async () => {
      try {
        const runtimeModules = loadModules ? await loadModules() : null;
        const playgroundCoreModules =
          runtimeModules ??
          ({
            ...(await loadPlaygroundCore()),
          } as PlaygroundCoreModules);
        const platforms = buildRegisteredPlatforms(
          runtimeModules
            ? [
                {
                  id: 'web',
                  label: 'Web',
                  description: 'Open and control a Chromium page',
                  staticDirPackage: '@midscene/web',
                  prepare: async () =>
                    prepareStudioWebPlatform({
                      loadWebModule: async () => ({
                        PuppeteerAgent: runtimeModules.PuppeteerAgent,
                        launchPuppeteerPage: runtimeModules.launchPuppeteerPage,
                      }),
                    }),
                },
                {
                  id: 'android',
                  label: 'Android',
                  description: 'Connect to an Android device via ADB',
                  staticDirPackage: '@midscene/android-playground',
                  prepare: async (staticDir) =>
                    runtimeModules.androidPlaygroundPlatform.prepare({
                      staticDir,
                      scrcpyServer: new runtimeModules.ScrcpyServer(
                        deviceDiscoveryService
                          ? {
                              deviceListSource:
                                await createScrcpyDeviceListSource(
                                  deviceDiscoveryService,
                                ),
                            }
                          : undefined,
                      ),
                    }),
                },
                {
                  id: 'ios',
                  label: 'iOS',
                  description: 'Connect to an iOS device via WebDriverAgent',
                  staticDirPackage: '@midscene/ios',
                  prepare: (staticDir) =>
                    runtimeModules.iosPlaygroundPlatform.prepare({ staticDir }),
                },
                {
                  id: 'harmony',
                  label: 'HarmonyOS',
                  description: 'Connect to a HarmonyOS device via HDC',
                  staticDirPackage: '@midscene/harmony',
                  prepare: (staticDir) =>
                    runtimeModules.harmonyPlaygroundPlatform.prepare({
                      staticDir,
                      deferConnection: true,
                    }),
                },
                {
                  id: 'computer',
                  label: 'Computer',
                  description: 'Control the local desktop',
                  staticDirPackage: '@midscene/computer-playground',
                  prepare: (staticDir) =>
                    runtimeModules.computerPlaygroundPlatform.prepare({
                      staticDir,
                      getWindowController: () => null,
                    }),
                },
              ]
            : createStudioPlatformSpecs({
                deviceDiscoveryService,
                loadAndroidModule,
                loadComputerModule,
                loadHarmonyModule,
                loadIosModule,
                loadWebModule,
              }),
          resolvePackageStaticDir,
        );
        const prepared =
          await playgroundCoreModules.prepareMultiPlatformPlayground(
            platforms,
            {
              title: 'Midscene Studio',
              description: 'Multi-platform playground',
              selectorFieldKey: 'platformId',
              selectorVariant: 'cards',
            },
          );

        const nextLaunchResult =
          await playgroundCoreModules.launchPreparedPlaygroundPlatform(
            prepared,
            {
              corsOptions: createStudioCorsOptions(),
              enableCors: true,
              openBrowser: false,
              verbose: false,
            },
          );

        launchResult = nextLaunchResult;
        bootstrap = {
          status: 'ready',
          serverUrl: `http://${nextLaunchResult.host}:${nextLaunchResult.port}`,
          port: nextLaunchResult.port,
          error: null,
        };

        return bootstrap;
      } catch (error) {
        bootstrap = {
          status: 'error',
          serverUrl: null,
          port: null,
          error: getErrorMessage(error),
        };
        return bootstrap;
      } finally {
        startPromise = null;
      }
    })();

    return startPromise;
  };

  return {
    close,
    getBootstrap: () => bootstrap,
    restart: async () => {
      await close();
      return start();
    },
    start,
  };
}
