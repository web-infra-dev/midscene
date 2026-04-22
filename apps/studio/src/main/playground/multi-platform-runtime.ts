import { createRequire } from 'node:module';
import path from 'node:path';
import type {
  LaunchPlaygroundResult,
  PreparedPlaygroundPlatform,
  RegisteredPlaygroundPlatform,
} from '@midscene/playground';
import type { PlaygroundBootstrap } from '@shared/electron-contract';
import { ensureStudioShellEnvHydrated } from '../shell-env';
import { createStudioCorsOptions } from './cors';
import type { PlaygroundRuntimeService } from './types';

const require = createRequire(__filename);

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

type MultiPlatformRuntimeModules = {
  ScrcpyServer: AndroidPlaygroundModule['ScrcpyServer'];
  androidPlaygroundPlatform: AndroidPlaygroundModule['androidPlaygroundPlatform'];
  computerPlaygroundPlatform: ComputerPlaygroundModule['computerPlaygroundPlatform'];
  harmonyPlaygroundPlatform: HarmonyPlaygroundModule['harmonyPlaygroundPlatform'];
  iosPlaygroundPlatform: IosPlaygroundModule['iosPlaygroundPlatform'];
  launchPreparedPlaygroundPlatform: PlaygroundModule['launchPreparedPlaygroundPlatform'];
  prepareMultiPlatformPlayground: PlaygroundModule['prepareMultiPlatformPlayground'];
};

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

export async function loadMultiPlatformRuntimeModules(): Promise<MultiPlatformRuntimeModules> {
  const [
    androidPlaygroundModule,
    computerPlaygroundModule,
    harmonyPlaygroundModule,
    iosPlaygroundModule,
    playgroundCoreModules,
  ] = await Promise.all([
    loadAndroidPlaygroundModule(),
    loadComputerPlaygroundModule(),
    loadHarmonyPlaygroundModule(),
    loadIosPlaygroundModule(),
    loadPlaygroundCoreModules(),
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

const createStudioPlatformSpecs = ({
  loadAndroidModule = loadAndroidPlaygroundModule,
  loadComputerModule = loadComputerPlaygroundModule,
  loadHarmonyModule = loadHarmonyPlaygroundModule,
  loadIosModule = loadIosPlaygroundModule,
}: {
  loadAndroidModule?: typeof loadAndroidPlaygroundModule;
  loadComputerModule?: typeof loadComputerPlaygroundModule;
  loadHarmonyModule?: typeof loadHarmonyPlaygroundModule;
  loadIosModule?: typeof loadIosPlaygroundModule;
} = {}): StudioPlatformSpec[] => [
  {
    id: 'android',
    label: 'Android',
    description: 'Connect to an Android device via ADB',
    staticDirPackage: '@midscene/android-playground',
    prepare: async (staticDir) => {
      const androidModule = await loadAndroidModule();
      return androidModule.androidPlaygroundPlatform.prepare({
        staticDir,
        scrcpyServer: new androidModule.ScrcpyServer(),
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
 * (Android, iOS, HarmonyOS, Computer) with
 * `prepareMultiPlatformPlayground` and launches a SINGLE unified HTTP
 * server. The renderer talks to this one server; the platform selector
 * on the setup form routes to the correct backend.
 */
export function createMultiPlatformRuntimeService({
  loadModules,
  loadPlaygroundCore = loadPlaygroundCoreModules,
  loadAndroidModule = loadAndroidPlaygroundModule,
  loadComputerModule = loadComputerPlaygroundModule,
  loadHarmonyModule = loadHarmonyPlaygroundModule,
  loadIosModule = loadIosPlaygroundModule,
  resolvePackageStaticDir = resolveStaticDir,
}: {
  loadModules?: () => Promise<MultiPlatformRuntimeModules>;
  loadPlaygroundCore?: () => Promise<PlaygroundCoreModules>;
  loadAndroidModule?: typeof loadAndroidPlaygroundModule;
  loadComputerModule?: typeof loadComputerPlaygroundModule;
  loadHarmonyModule?: typeof loadHarmonyPlaygroundModule;
  loadIosModule?: typeof loadIosPlaygroundModule;
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
                  id: 'android',
                  label: 'Android',
                  description: 'Connect to an Android device via ADB',
                  staticDirPackage: '@midscene/android-playground',
                  prepare: (staticDir) =>
                    runtimeModules.androidPlaygroundPlatform.prepare({
                      staticDir,
                      scrcpyServer: new runtimeModules.ScrcpyServer(),
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
                loadAndroidModule,
                loadComputerModule,
                loadHarmonyModule,
                loadIosModule,
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
