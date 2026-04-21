import { createRequire } from 'node:module';
import path from 'node:path';
import type { PlaygroundBootstrap } from '@shared/electron-contract';
import { createStudioCorsOptions } from './cors';
import type { PlaygroundRuntimeService } from './types';

const require = createRequire(__filename);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unknown playground runtime error';
}

interface MultiPlatformRuntimeModules {
  ScrcpyServer: new () => unknown;
  androidPlaygroundPlatform: {
    prepare: (options: {
      staticDir: string;
      scrcpyServer: unknown;
    }) => Promise<PreparedPlaygroundPlatform>;
  };
  computerPlaygroundPlatform: {
    prepare: (options: {
      staticDir: string;
      getWindowController: () => null;
    }) => Promise<PreparedPlaygroundPlatform>;
  };
  harmonyPlaygroundPlatform: {
    prepare: (options: {
      staticDir: string;
    }) => Promise<PreparedPlaygroundPlatform>;
  };
  iosPlaygroundPlatform: {
    prepare: (options: {
      staticDir: string;
    }) => Promise<PreparedPlaygroundPlatform>;
  };
  launchPreparedPlaygroundPlatform: (
    prepared: unknown,
    options: {
      corsOptions: ReturnType<typeof createStudioCorsOptions>;
      enableCors: boolean;
      openBrowser: boolean;
      verbose: boolean;
    },
  ) => Promise<LaunchPlaygroundResult>;
  prepareMultiPlatformPlayground: (
    platforms: RegisteredPlaygroundPlatform[],
    options: {
      title: string;
      description: string;
      selectorFieldKey: string;
      selectorVariant: string;
    },
  ) => Promise<unknown>;
}

interface PreparedPlaygroundPlatform {
  [key: string]: unknown;
}

interface RegisteredPlaygroundPlatform {
  id: string;
  label: string;
  description: string;
  prepare: () => Promise<PreparedPlaygroundPlatform>;
}

interface LaunchPlaygroundResult {
  close: () => Promise<void>;
  host: string;
  port: number;
}

export async function loadMultiPlatformRuntimeModules(): Promise<MultiPlatformRuntimeModules> {
  const [
    androidPlaygroundModule,
    computerPlaygroundModule,
    harmonyPlaygroundModule,
    iosPlaygroundModule,
    playgroundModule,
  ] = await Promise.all([
    import('@midscene/android-playground'),
    import('@midscene/computer-playground'),
    import('@midscene/harmony'),
    import('@midscene/ios'),
    import('@midscene/playground'),
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
      playgroundModule.launchPreparedPlaygroundPlatform,
    prepareMultiPlatformPlayground:
      playgroundModule.prepareMultiPlatformPlayground,
  };
}

export function resolveStaticDir(packageName: string): string {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  return path.join(path.dirname(packageJsonPath), 'static');
}

interface StudioPlatformSpec {
  id: string;
  label: string;
  description: string;
  staticDirPackage: string;
  prepare: (
    modules: MultiPlatformRuntimeModules,
    staticDir: string,
  ) => Promise<PreparedPlaygroundPlatform>;
}

const studioPlatformSpecs: StudioPlatformSpec[] = [
  {
    id: 'android',
    label: 'Android',
    description: 'Connect to an Android device via ADB',
    staticDirPackage: '@midscene/android-playground',
    prepare: (modules, staticDir) =>
      modules.androidPlaygroundPlatform.prepare({
        staticDir,
        scrcpyServer: new modules.ScrcpyServer(),
      }),
  },
  {
    id: 'ios',
    label: 'iOS',
    description: 'Connect to an iOS device via WebDriverAgent',
    staticDirPackage: '@midscene/ios',
    prepare: (modules, staticDir) =>
      modules.iosPlaygroundPlatform.prepare({ staticDir }),
  },
  {
    id: 'harmony',
    label: 'HarmonyOS',
    description: 'Connect to a HarmonyOS device via HDC',
    staticDirPackage: '@midscene/harmony',
    prepare: (modules, staticDir) =>
      modules.harmonyPlaygroundPlatform.prepare({ staticDir }),
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
    prepare: (modules, staticDir) =>
      modules.computerPlaygroundPlatform.prepare({
        staticDir,
        getWindowController: () => null,
      }),
  },
];

function buildRegisteredPlatforms(
  modules: MultiPlatformRuntimeModules,
  resolvePackageStaticDir: (packageName: string) => string,
): RegisteredPlaygroundPlatform[] {
  return studioPlatformSpecs.map((spec) => {
    const staticDir = resolvePackageStaticDir(spec.staticDirPackage);
    return {
      id: spec.id,
      label: spec.label,
      description: spec.description,
      prepare: () => spec.prepare(modules, staticDir),
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
  loadModules = loadMultiPlatformRuntimeModules,
  resolvePackageStaticDir = resolveStaticDir,
}: {
  loadModules?: () => Promise<MultiPlatformRuntimeModules>;
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
        const modules = await loadModules();
        const platforms = buildRegisteredPlatforms(
          modules,
          resolvePackageStaticDir,
        );
        const prepared = await modules.prepareMultiPlatformPlayground(
          platforms,
          {
            title: 'Midscene Studio',
            description: 'Multi-platform playground',
            selectorFieldKey: 'platformId',
            selectorVariant: 'cards',
          },
        );

        const nextLaunchResult =
          await modules.launchPreparedPlaygroundPlatform(prepared, {
            corsOptions: createStudioCorsOptions(),
            enableCors: true,
            openBrowser: false,
            verbose: false,
          });

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
