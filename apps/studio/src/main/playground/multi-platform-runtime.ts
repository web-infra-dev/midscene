import { createRequire } from 'node:module';
import path from 'node:path';
import {
  ScrcpyServer,
  androidPlaygroundPlatform,
} from '@midscene/android-playground';
import { computerPlaygroundPlatform } from '@midscene/computer-playground';
import { harmonyPlaygroundPlatform } from '@midscene/harmony';
import { iosPlaygroundPlatform } from '@midscene/ios';
import {
  type LaunchPlaygroundResult,
  type PreparedPlaygroundPlatform,
  type RegisteredPlaygroundPlatform,
  launchPreparedPlaygroundPlatform,
  prepareMultiPlatformPlayground,
} from '@midscene/playground';
import type { PlaygroundBootstrap } from '@shared/electron-contract';
import { createStudioCorsOptions } from './cors';
import type { PlaygroundRuntimeService } from './types';

const require = createRequire(__filename);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unknown playground runtime error';
}

function resolveStaticDir(packageName: string): string {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  return path.join(path.dirname(packageJsonPath), 'static');
}

interface StudioPlatformSpec {
  id: string;
  label: string;
  description: string;
  staticDirPackage: string;
  prepare: (staticDir: string) => Promise<PreparedPlaygroundPlatform>;
}

const studioPlatformSpecs: StudioPlatformSpec[] = [
  {
    id: 'android',
    label: 'Android',
    description: 'Connect to an Android device via ADB',
    staticDirPackage: '@midscene/android-playground',
    prepare: (staticDir) =>
      androidPlaygroundPlatform.prepare({
        staticDir,
        scrcpyServer: new ScrcpyServer(),
      }),
  },
  {
    id: 'ios',
    label: 'iOS',
    description: 'Connect to an iOS device via WebDriverAgent',
    staticDirPackage: '@midscene/ios',
    prepare: (staticDir) => iosPlaygroundPlatform.prepare({ staticDir }),
  },
  {
    id: 'harmony',
    label: 'HarmonyOS',
    description: 'Connect to a HarmonyOS device via HDC',
    staticDirPackage: '@midscene/harmony',
    prepare: (staticDir) => harmonyPlaygroundPlatform.prepare({ staticDir }),
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
    prepare: (staticDir) =>
      computerPlaygroundPlatform.prepare({
        staticDir,
        getWindowController: () => null,
      }),
  },
];

function buildRegisteredPlatforms(): RegisteredPlaygroundPlatform[] {
  return studioPlatformSpecs.map((spec) => {
    const staticDir = resolveStaticDir(spec.staticDirPackage);
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
export function createMultiPlatformRuntimeService(): PlaygroundRuntimeService {
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
        const platforms = buildRegisteredPlatforms();
        const prepared = await prepareMultiPlatformPlayground(platforms, {
          title: 'Midscene Studio',
          description: 'Multi-platform playground',
          selectorFieldKey: 'platformId',
          selectorVariant: 'cards',
        });

        const nextLaunchResult = await launchPreparedPlaygroundPlatform(
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
