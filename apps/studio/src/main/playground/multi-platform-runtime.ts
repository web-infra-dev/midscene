import { createRequire } from 'node:module';
import path from 'node:path';
import { ScrcpyServer } from '@midscene/android-playground';
import { androidPlaygroundPlatform } from '@midscene/android-playground';
import { computerPlaygroundPlatform } from '@midscene/computer-playground';
import { harmonyPlaygroundPlatform } from '@midscene/harmony';
import { iosPlaygroundPlatform } from '@midscene/ios';
import {
  type LaunchPlaygroundResult,
  type RegisteredPlaygroundPlatform,
  prepareMultiPlatformPlayground,
} from '@midscene/playground';
import { launchPreparedPlaygroundPlatform } from '@midscene/playground';
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

function tryResolveStaticDir(packageName: string): string | null {
  try {
    return resolveStaticDir(packageName);
  } catch {
    return null;
  }
}

/**
 * Build the list of registered platforms. Each platform is resolved lazily
 * so that a missing optional package (e.g. `@midscene/ios` on a machine
 * without Xcode) marks the platform unavailable instead of crashing.
 */
function buildRegisteredPlatforms(): RegisteredPlaygroundPlatform[] {
  const platforms: RegisteredPlaygroundPlatform[] = [];

  // ── Android ───────────────────────────────────────────────────────
  const androidStaticDir = tryResolveStaticDir('@midscene/android-playground');
  if (androidStaticDir) {
    platforms.push({
      id: 'android',
      label: 'Android',
      description: 'Connect to an Android device via ADB',
      prepare: async () =>
        androidPlaygroundPlatform.prepare({
          staticDir: androidStaticDir,
          scrcpyServer: new ScrcpyServer(),
        }),
    });
  } else {
    platforms.push({
      id: 'android',
      label: 'Android',
      unavailableReason:
        '@midscene/android-playground package not found. Run pnpm install.',
      prepare: async () => {
        throw new Error('Android platform is not available');
      },
    });
  }

  // ── iOS ───────────────────────────────────────────────────────────
  const iosStaticDir = tryResolveStaticDir('@midscene/ios');
  if (iosStaticDir) {
    platforms.push({
      id: 'ios',
      label: 'iOS',
      description: 'Connect to an iOS device via WebDriverAgent',
      prepare: async () =>
        iosPlaygroundPlatform.prepare({ staticDir: iosStaticDir }),
    });
  } else {
    platforms.push({
      id: 'ios',
      label: 'iOS',
      unavailableReason: '@midscene/ios package not found. Run pnpm install.',
      prepare: async () => {
        throw new Error('iOS platform is not available');
      },
    });
  }

  // ── HarmonyOS ─────────────────────────────────────────────────────
  const harmonyStaticDir = tryResolveStaticDir('@midscene/harmony');
  if (harmonyStaticDir) {
    platforms.push({
      id: 'harmony',
      label: 'HarmonyOS',
      description: 'Connect to a HarmonyOS device via HDC',
      prepare: async () =>
        harmonyPlaygroundPlatform.prepare({ staticDir: harmonyStaticDir }),
    });
  } else {
    platforms.push({
      id: 'harmony',
      label: 'HarmonyOS',
      unavailableReason:
        '@midscene/harmony package not found. Run pnpm install.',
      prepare: async () => {
        throw new Error('HarmonyOS platform is not available');
      },
    });
  }

  // ── Computer ──────────────────────────────────────────────────────
  const computerStaticDir = tryResolveStaticDir(
    '@midscene/computer-playground',
  );
  if (computerStaticDir) {
    platforms.push({
      id: 'computer',
      label: 'Computer',
      description: 'Control the local desktop',
      prepare: async () =>
        computerPlaygroundPlatform.prepare({
          staticDir: computerStaticDir,
          // In the Electron context, pass null — the computer agent works
          // without window controller, it just won't auto-minimize Studio
          // during task execution. A follow-up can provide an Electron-
          // native adapter that calls mainWindow.minimize()/restore().
          getWindowController: () => null,
        }),
    });
  } else {
    platforms.push({
      id: 'computer',
      label: 'Computer',
      unavailableReason:
        '@midscene/computer-playground package not found. Run pnpm install.',
      prepare: async () => {
        throw new Error('Computer platform is not available');
      },
    });
  }

  return platforms;
}

/**
 * Creates a multi-platform playground runtime service for the Studio
 * Electron main process. On `start()`, it registers all available
 * platforms (Android, iOS, HarmonyOS, Computer) with
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
